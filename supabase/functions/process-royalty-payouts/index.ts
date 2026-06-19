/**
 * process-royalty-payouts
 *
 * Admin-only edge function for quarterly royalty payouts.
 *
 * Safety:
 * - dry_run defaults to true
 * - real execution only runs when STRIPE_CONNECT_PAYOUTS_ENABLED=true
 * - royalties are marked paid only after a successful Stripe transfer and a
 *   transactional DB finalize RPC
 *
 * Review behavior:
 * - creators on payout hold or suspension are skipped
 * - full disputes and full refunds are excluded
 * - partial refunds are prorated instead of excluding the full royalty row
 * - large payouts are flagged and require allow_flagged=true to execute
 */

import {
  handleRequest,
  HttpError,
  json,
  parseBoolean,
  parseJson,
  requireInternalRequest,
  stripe,
  supabaseAdmin,
} from '../_shared/utils.ts';

const STRIPE_CONNECT_RATE = 0.0025;
const STRIPE_CONNECT_FLAT = 25;
const LARGE_PAYOUT_ALERT_CENTS = 50000;

function computeStripeFee(amountCents: number): number {
  return Math.ceil(amountCents * STRIPE_CONNECT_RATE + STRIPE_CONNECT_FLAT);
}

type LedgerRow = {
  id: string;
  creator_id: string;
  royalty_type: 'resale' | 'print' | 'print_owner' | 'personalized_request';
  royalty_amount_cents: number;
  transfer_id: string | null;
  print_id: string | null;
  web_print_order_id: string | null;
  personalized_request_id: string | null;
  sale_amount_cents: number | null;
};

type PaymentEventProblem = {
  disputed_at: string | null;
  refunded_at: string | null;
  refund_amount_cents: number | null;
  amount_cents: number;
};

type CreatorAccum = {
  resaleCents: number;
  printCents: number;         // 'print' (original creator royalty, admin-set)
  printOwnerCents: number;    // 'print_owner' (fixed $2.50 to current autograph owner)
  personalizedCents: number;  // 'personalized_request' (creator payout on personalized requests)
  payableRowIds: string[];
  disputedRowIds: string[];
  refundedRowIds: string[];
  partialRefundRowCount: number;
  adjustmentCents: number;
};

type PayoutResult = {
  creator_id: string;
  status: 'paid' | 'dry_run' | 'skipped';
  skip_reason?: string;
  gross_payout_cents?: number;
  stripe_fee_cents?: number;
  net_payout_cents?: number;
  resale_total_cents?: number;
  print_total_cents?: number;
  print_owner_total_cents?: number;
  personalized_total_cents?: number;
  row_count?: number;
  excluded_row_count?: number;
  partial_refund_row_count?: number;
  adjustment_cents?: number;
  flagged?: boolean;
  flag_reason?: string;
  stripe_transfer_id?: string;
};

async function excludeRows(disputedIds: string[], refundedIds: string[]) {
  const now = new Date().toISOString();

  if (disputedIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('royalties_ledger')
      .update({ excluded_at: now, excluded_reason: 'chargeback' })
      .in('id', disputedIds);
    if (error) throw new HttpError(500, error.message);
  }

  if (refundedIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('royalties_ledger')
      .update({ excluded_at: now, excluded_reason: 'full_refund' })
      .in('id', refundedIds);
    if (error) throw new HttpError(500, error.message);
  }
}

Deno.serve((req) =>
  handleRequest(async (request) => {
    requireInternalRequest(request);

    const body = await parseJson(request).catch(() => ({}));
    const dryRun = parseBoolean(body.dry_run, true);
    const allowFlagged = parseBoolean(body.allow_flagged, false);
    const payoutsEnabled = Deno.env.get('STRIPE_CONNECT_PAYOUTS_ENABLED') === 'true';

    const { data: unpaidRows, error: fetchError } = await supabaseAdmin
      .from('royalties_ledger')
      .select('id, creator_id, royalty_type, royalty_amount_cents, transfer_id, print_id, web_print_order_id, personalized_request_id, sale_amount_cents')
      .is('paid_at', null)
      .is('excluded_at', null);

    if (fetchError) throw new HttpError(500, fetchError.message);

    if (!unpaidRows || unpaidRows.length === 0) {
      return json({
        dry_run: dryRun,
        processed: 0,
        skipped: 0,
        total_net_payout_cents: 0,
        message: 'No unpaid royalties found.',
        results: [],
      });
    }

    const transferIds = unpaidRows
      .map((row: LedgerRow) => row.transfer_id)
      .filter(Boolean) as string[];
    const printIds = unpaidRows
      .map((row: LedgerRow) => row.print_id)
      .filter(Boolean) as string[];
    const webPrintOrderIds = unpaidRows
      .map((row: LedgerRow) => row.web_print_order_id)
      .filter(Boolean) as string[];

    const transferPaymentMap = new Map<string, string>();
    if (transferIds.length > 0) {
      const { data: transfers, error } = await supabaseAdmin
        .from('transfers')
        .select('id, payment_event_id')
        .in('id', transferIds)
        .not('payment_event_id', 'is', null);
      if (error) throw new HttpError(500, error.message);
      for (const transfer of transfers ?? []) {
        if (transfer.payment_event_id) transferPaymentMap.set(transfer.id, transfer.payment_event_id);
      }
    }

    const webPrintProblemMap = new Map<string, PaymentEventProblem>();
    if (webPrintOrderIds.length > 0) {
      const { data: webOrders, error } = await supabaseAdmin
        .from('web_print_orders')
        .select('id, stripe_payment_intent_id, disputed_at, refunded_at, refund_amount_cents, amount_cents')
        .in('id', webPrintOrderIds);
      if (error) throw new HttpError(500, error.message);
      for (const order of webOrders ?? []) {
        webPrintProblemMap.set(order.id, {
          disputed_at: order.disputed_at ?? null,
          refunded_at: order.refunded_at ?? null,
          refund_amount_cents: order.refund_amount_cents ?? null,
          amount_cents: order.amount_cents ?? 0,
        });
      }
    }

    const printPaymentMap = new Map<string, string>();
    if (printIds.length > 0) {
      const { data: prints, error } = await supabaseAdmin
        .from('autograph_prints')
        .select('id, payment_event_id')
        .in('id', printIds)
        .not('payment_event_id', 'is', null);
      if (error) throw new HttpError(500, error.message);
      for (const print of prints ?? []) {
        if (print.payment_event_id) printPaymentMap.set(print.id, print.payment_event_id);
      }
    }

    const personalizedIds = (unpaidRows as LedgerRow[])
      .map((row) => row.personalized_request_id)
      .filter(Boolean) as string[];
    const personalizedPaymentMap = new Map<string, string>();
    if (personalizedIds.length > 0) {
      const { data: requests, error } = await supabaseAdmin
        .from('personalized_autograph_requests')
        .select('id, authorization_payment_event_id')
        .in('id', personalizedIds)
        .not('authorization_payment_event_id', 'is', null);
      if (error) throw new HttpError(500, error.message);
      for (const req of requests ?? []) {
        if (req.authorization_payment_event_id)
          personalizedPaymentMap.set(req.id, req.authorization_payment_event_id);
      }
    }

    const paymentEventIds = Array.from(
      new Set([
        ...transferPaymentMap.values(),
        ...printPaymentMap.values(),
        ...personalizedPaymentMap.values(),
      ]),
    );

    const paymentProblemMap = new Map<string, PaymentEventProblem>();
    if (paymentEventIds.length > 0) {
      const { data: paymentEvents, error } = await supabaseAdmin
        .from('payment_events')
        .select('id, disputed_at, refunded_at, refund_amount_cents, amount_cents')
        .in('id', paymentEventIds);
      if (error) throw new HttpError(500, error.message);
      for (const event of paymentEvents ?? []) {
        paymentProblemMap.set(event.id, {
          disputed_at: event.disputed_at ?? null,
          refunded_at: event.refunded_at ?? null,
          refund_amount_cents: event.refund_amount_cents ?? null,
          amount_cents: event.amount_cents,
        });
      }
    }

    const byCreator = new Map<string, CreatorAccum>();

    for (const row of unpaidRows as LedgerRow[]) {
      const acc = byCreator.get(row.creator_id) ?? {
        resaleCents: 0,
        printCents: 0,
        printOwnerCents: 0,
        personalizedCents: 0,
        payableRowIds: [],
        disputedRowIds: [],
        refundedRowIds: [],
        partialRefundRowCount: 0,
        adjustmentCents: 0,
      };

      const paymentEventId =
        (row.transfer_id ? transferPaymentMap.get(row.transfer_id) : null) ??
        (row.print_id ? printPaymentMap.get(row.print_id) : null) ??
        (row.personalized_request_id ? personalizedPaymentMap.get(row.personalized_request_id) : null) ??
        null;
      const paymentEvent =
        (row.web_print_order_id ? webPrintProblemMap.get(row.web_print_order_id) : null) ??
        (paymentEventId ? paymentProblemMap.get(paymentEventId) : null) ??
        null;

      if (paymentEvent?.disputed_at) {
        acc.disputedRowIds.push(row.id);
        byCreator.set(row.creator_id, acc);
        continue;
      }

      let payoutRoyaltyCents = row.royalty_amount_cents;

      if (paymentEvent?.refunded_at && (paymentEvent.refund_amount_cents ?? 0) > 0) {
        if (paymentEvent.amount_cents <= 0) {
          acc.refundedRowIds.push(row.id);
          byCreator.set(row.creator_id, acc);
          continue;
        }
        const refundAmount = Math.min(paymentEvent.refund_amount_cents ?? 0, paymentEvent.amount_cents);

        if (refundAmount >= paymentEvent.amount_cents) {
          acc.refundedRowIds.push(row.id);
          byCreator.set(row.creator_id, acc);
          continue;
        }

        const remainingRatio = (paymentEvent.amount_cents - refundAmount) / paymentEvent.amount_cents;
        const adjusted = Math.floor(row.royalty_amount_cents * remainingRatio);

        if (adjusted <= 0) {
          acc.refundedRowIds.push(row.id);
          byCreator.set(row.creator_id, acc);
          continue;
        }

        acc.partialRefundRowCount += 1;
        acc.adjustmentCents += row.royalty_amount_cents - adjusted;
        payoutRoyaltyCents = adjusted;
      }

      if (row.royalty_type === 'resale') {
        acc.resaleCents += payoutRoyaltyCents;
      } else if (row.royalty_type === 'print_owner') {
        acc.printOwnerCents += payoutRoyaltyCents;
      } else if (row.royalty_type === 'personalized_request') {
        acc.personalizedCents += payoutRoyaltyCents;
      } else {
        // 'print' — original admin-set creator royalty
        acc.printCents += payoutRoyaltyCents;
      }
      acc.payableRowIds.push(row.id);
      byCreator.set(row.creator_id, acc);
    }

    const creatorIds = [...byCreator.keys()];
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, minimum_payout_cents, payout_hold, payout_hold_reason, suspended_at, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_onboarding_complete')
      .in('id', creatorIds);
    if (profileError) throw new HttpError(500, profileError.message);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    let processed = 0;
    let skipped = 0;
    let totalPayoutCents = 0;
    const results: PayoutResult[] = [];

    for (const [creatorId, acc] of byCreator.entries()) {
      const profile = profileMap.get(creatorId);
      const minimumPayout = profile?.minimum_payout_cents ?? 1000;
      const totalCents = acc.resaleCents + acc.printCents + acc.printOwnerCents + acc.personalizedCents;
      const excludedCount = acc.disputedRowIds.length + acc.refundedRowIds.length;

      if (profile?.suspended_at) {
        skipped++;
        results.push({
          creator_id: creatorId,
          status: 'skipped',
          skip_reason: 'account_suspended',
          excluded_row_count: excludedCount,
          partial_refund_row_count: acc.partialRefundRowCount,
          adjustment_cents: acc.adjustmentCents,
        });
        if (!dryRun) await excludeRows(acc.disputedRowIds, acc.refundedRowIds);
        continue;
      }

      if (profile?.payout_hold) {
        skipped++;
        results.push({
          creator_id: creatorId,
          status: 'skipped',
          skip_reason: `payout_hold${profile.payout_hold_reason ? ': ' + profile.payout_hold_reason : ''}`,
          excluded_row_count: excludedCount,
          partial_refund_row_count: acc.partialRefundRowCount,
          adjustment_cents: acc.adjustmentCents,
        });
        if (!dryRun) await excludeRows(acc.disputedRowIds, acc.refundedRowIds);
        continue;
      }

      if (totalCents < minimumPayout) {
        skipped++;
        results.push({
          creator_id: creatorId,
          status: 'skipped',
          skip_reason: `below_minimum ($${(totalCents / 100).toFixed(2)} of $${(minimumPayout / 100).toFixed(2)} threshold)`,
          gross_payout_cents: totalCents,
          resale_total_cents: acc.resaleCents,
          print_total_cents: acc.printCents,
          print_owner_total_cents: acc.printOwnerCents,
          personalized_total_cents: acc.personalizedCents,
          row_count: acc.payableRowIds.length,
          excluded_row_count: excludedCount,
          partial_refund_row_count: acc.partialRefundRowCount,
          adjustment_cents: acc.adjustmentCents,
        });
        if (!dryRun) await excludeRows(acc.disputedRowIds, acc.refundedRowIds);
        continue;
      }

      const stripeFee = computeStripeFee(totalCents);
      const netPayout = Math.max(0, totalCents - stripeFee);

      if (netPayout <= 0) {
        skipped++;
        results.push({
          creator_id: creatorId,
          status: 'skipped',
          skip_reason: 'net_zero_after_fees',
          gross_payout_cents: totalCents,
          stripe_fee_cents: stripeFee,
          excluded_row_count: excludedCount,
          partial_refund_row_count: acc.partialRefundRowCount,
          adjustment_cents: acc.adjustmentCents,
        });
        if (!dryRun) await excludeRows(acc.disputedRowIds, acc.refundedRowIds);
        continue;
      }

      const flagged = netPayout >= LARGE_PAYOUT_ALERT_CENTS;
      const result: PayoutResult = {
        creator_id: creatorId,
        status: dryRun ? 'dry_run' : 'paid',
        gross_payout_cents: totalCents,
        stripe_fee_cents: stripeFee,
        net_payout_cents: netPayout,
        resale_total_cents: acc.resaleCents,
        print_total_cents: acc.printCents,
        print_owner_total_cents: acc.printOwnerCents,
        personalized_total_cents: acc.personalizedCents,
        row_count: acc.payableRowIds.length,
        excluded_row_count: excludedCount,
        partial_refund_row_count: acc.partialRefundRowCount,
        adjustment_cents: acc.adjustmentCents,
        flagged,
        flag_reason: flagged ? `Payout exceeds $${(LARGE_PAYOUT_ALERT_CENTS / 100).toFixed(0)} — verify before approving` : undefined,
      };

      if (!dryRun) {
        if (flagged && !allowFlagged) {
          result.status = 'skipped';
          result.skip_reason = 'flagged_large_payout_requires_allow_flagged';
          await excludeRows(acc.disputedRowIds, acc.refundedRowIds);
          skipped++;
          results.push(result);
          continue;
        }

        if (!payoutsEnabled) {
          result.status = 'skipped';
          result.skip_reason = 'connect_payouts_disabled';
          await excludeRows(acc.disputedRowIds, acc.refundedRowIds);
          skipped++;
          results.push(result);
          continue;
        }

        const connectAccountId = profile?.stripe_connect_account_id;
        const connectReady =
          profile?.stripe_connect_onboarding_complete === true &&
          profile?.stripe_connect_charges_enabled === true &&
          profile?.stripe_connect_payouts_enabled === true &&
          typeof connectAccountId === 'string' &&
          connectAccountId.length > 0;
        if (!connectReady) {
          result.status = 'skipped';
          result.skip_reason = 'connect_account_not_ready';
          await excludeRows(acc.disputedRowIds, acc.refundedRowIds);
          skipped++;
          results.push(result);
          continue;
        }

        const transfer = await stripe.transfers.create({
          amount: netPayout,
          currency: 'usd',
          destination: connectAccountId,
          metadata: {
            creator_id: creatorId,
            royalty_row_count: String(acc.payableRowIds.length),
          },
        });

        const { data: batchId, error: finalizeError } = await supabaseAdmin.rpc(
          'rpc_finalize_royalty_payout_batch',
          {
            p_creator_id: creatorId,
            p_row_ids: acc.payableRowIds,
            p_payout_amount_cents: totalCents,
            p_stripe_connect_fee_cents: stripeFee,
            p_net_payout_cents: netPayout,
            p_resale_total_cents: acc.resaleCents,
            // print_total_cents in the batch table covers all print-related types
            p_print_total_cents: acc.printCents + acc.printOwnerCents + acc.personalizedCents,
            p_row_count: acc.payableRowIds.length,
            p_stripe_transfer_id: transfer.id,
          },
        );

        if (finalizeError || !batchId) {
          result.status = 'skipped';
          result.skip_reason = 'finalize_failed_after_transfer';
          result.stripe_transfer_id = transfer.id;
          skipped++;
          results.push(result);
          continue;
        }

        await excludeRows(acc.disputedRowIds, acc.refundedRowIds);
        result.stripe_transfer_id = transfer.id;
      }

      totalPayoutCents += netPayout;
      processed++;
      results.push(result);
    }

    return json({
      dry_run: dryRun,
      processed,
      skipped,
      total_net_payout_cents: totalPayoutCents,
      total_net_payout_dollars: (totalPayoutCents / 100).toFixed(2),
      flagged_count: results.filter((row) => row.flagged).length,
      results,
    });
  }, req),
);

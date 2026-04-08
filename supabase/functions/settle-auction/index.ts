import { handleRequest, json, requireInternalRequest, sendExpoPush, stripe, supabaseAdmin } from '../_shared/utils.ts';

async function getToken(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.token ?? null;
}

type SettlementPlan = {
  status: 'not_auction' | 'not_ready' | 'pending_capture' | 'settled' | 'unsold';
  autograph_id: string;
  winner_bid_id?: string;
  winner_bidder_id?: string;
  winner_amount_cents?: number;
  winner_payment_event_id?: string;
  winner_payment_intent_id?: string;
  seller_id?: string;
  creator_id?: string;
  losers?: Array<{
    bid_id: string;
    bidder_id: string;
    payment_event_id: string | null;
    payment_intent_id: string | null;
    amount_cents: number;
  }>;
};

type SettlementFinalize = {
  status: 'settled' | 'unsold' | 'capture_retry_needed';
  transfer_id?: string;
  winner_bid_id?: string;
};

async function cancelLoserAuthorizations(losers: SettlementPlan['losers']) {
  const canceledPaymentEventIds: string[] = [];

  for (const loser of losers ?? []) {
    if (!loser.payment_intent_id || !loser.payment_event_id) continue;

    try {
      const intent = await stripe.paymentIntents.retrieve(loser.payment_intent_id);
      if (intent.status === 'canceled') {
        canceledPaymentEventIds.push(loser.payment_event_id);
        continue;
      }

      if (intent.status === 'requires_capture' || intent.status === 'requires_payment_method' || intent.status === 'requires_confirmation') {
        await stripe.paymentIntents.cancel(loser.payment_intent_id);
        canceledPaymentEventIds.push(loser.payment_event_id);
      }
    } catch (error) {
      console.error('Failed to cancel losing auction authorization:', loser.payment_intent_id, error);
    }
  }

  return canceledPaymentEventIds;
}

async function notifySettlement(plan: SettlementPlan, finalize: SettlementFinalize) {
  if (plan.status === 'unsold' || finalize.status === 'unsold') return;
  if (!plan.winner_bidder_id || !plan.seller_id) return;

  const winnerToken = await getToken(plan.winner_bidder_id);
  if (winnerToken && typeof plan.winner_amount_cents === 'number') {
    const amount = `$${(plan.winner_amount_cents / 100).toFixed(2)}`;
    await sendExpoPush(winnerToken, 'You won the auction!', `Congratulations! You won the auction for ${amount}.`);
  }

  for (const loser of plan.losers ?? []) {
    if (loser.bidder_id === plan.winner_bidder_id) continue;
    const loserToken = await getToken(loser.bidder_id);
    if (loserToken) {
      await sendExpoPush(loserToken, 'Auction ended', 'The auction ended and you did not win this autograph.');
    }
  }
}

Deno.serve((req) =>
  handleRequest(async (request) => {
    requireInternalRequest(request);

    const nowIso = new Date().toISOString();
    const { data: auctions, error: auctionsError } = await supabaseAdmin
      .from('autographs')
      .select('id')
      .or(`and(listing_type.eq.auction,is_for_sale.eq.true,auction_ends_at.lt.${nowIso}),auction_settlement_status.eq.pending_capture,auction_settlement_status.eq.settled,auction_settlement_status.eq.unsold`);

    if (auctionsError) {
      throw new Error(auctionsError.message);
    }

    let settled = 0;
    let unsold = 0;
    let captureRetryNeeded = 0;
    let cleanupCanceled = 0;

    for (const auction of auctions ?? []) {
      const { data: plan, error: planError } = await supabaseAdmin
        .rpc('rpc_start_auction_settlement', {
          p_autograph_id: auction.id,
        });

      if (planError || !plan) {
        console.error('rpc_start_auction_settlement failed:', auction.id, planError?.message);
        continue;
      }

      const typedPlan = plan as SettlementPlan;
      if (typedPlan.status === 'not_auction' || typedPlan.status === 'not_ready') {
        continue;
      }

      const canceledPaymentEventIds = await cancelLoserAuthorizations(typedPlan.losers);
      cleanupCanceled += canceledPaymentEventIds.length;

      if (typedPlan.status === 'settled') {
        const { error: finalizeError } = await supabaseAdmin
          .rpc('rpc_finalize_auction_settlement', {
            p_autograph_id: auction.id,
            p_winner_bid_id: typedPlan.winner_bid_id,
            p_capture_succeeded: true,
            p_canceled_loser_payment_event_ids: canceledPaymentEventIds,
          });

        if (finalizeError) {
          console.error('rpc_finalize_auction_settlement settled cleanup failed:', auction.id, finalizeError.message);
        }
        continue;
      }

      if (typedPlan.status === 'unsold') {
        const { data: finalize, error: finalizeError } = await supabaseAdmin
          .rpc('rpc_finalize_auction_settlement', {
            p_autograph_id: auction.id,
            p_winner_bid_id: null,
            p_capture_succeeded: false,
            p_canceled_loser_payment_event_ids: canceledPaymentEventIds,
          });

        if (finalizeError || !finalize) {
          console.error('rpc_finalize_auction_settlement unsold failed:', auction.id, finalizeError?.message);
          continue;
        }

        unsold++;
        continue;
      }

      if (!typedPlan.winner_payment_intent_id || !typedPlan.winner_bid_id) {
        console.error('Auction settlement plan missing winner payment reference:', auction.id);
        continue;
      }

      let captureSucceeded = false;
      try {
        const intent = await stripe.paymentIntents.retrieve(typedPlan.winner_payment_intent_id);
        if (intent.status === 'succeeded') {
          captureSucceeded = true;
        } else if (intent.status === 'requires_capture') {
          await stripe.paymentIntents.capture(typedPlan.winner_payment_intent_id);
          captureSucceeded = true;
        } else {
          console.error('Winner payment intent not capturable:', typedPlan.winner_payment_intent_id, intent.status);
        }
      } catch (error) {
        console.error('Failed to capture winning auction authorization:', typedPlan.winner_payment_intent_id, error);
      }

      const { data: finalize, error: finalizeError } = await supabaseAdmin
        .rpc('rpc_finalize_auction_settlement', {
          p_autograph_id: auction.id,
          p_winner_bid_id: typedPlan.winner_bid_id,
          p_capture_succeeded: captureSucceeded,
          p_canceled_loser_payment_event_ids: canceledPaymentEventIds,
        });

      if (finalizeError || !finalize) {
        console.error('rpc_finalize_auction_settlement failed:', auction.id, finalizeError?.message);
        continue;
      }

      const typedFinalize = finalize as SettlementFinalize;
      if (typedFinalize.status === 'capture_retry_needed') {
        captureRetryNeeded++;
        continue;
      }

      if (typedFinalize.status === 'settled') {
        settled++;
        await notifySettlement(typedPlan, typedFinalize);
      } else if (typedFinalize.status === 'unsold') {
        unsold++;
      }
    }

    return json({
      settled,
      unsold,
      capture_retry_needed: captureRetryNeeded,
      loser_authorizations_canceled: cleanupCanceled,
    });
  }, req)
);

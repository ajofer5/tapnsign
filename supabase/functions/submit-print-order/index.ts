import {
  assert,
  assertUsersNotBlocked,
  getAutographForUpdate,
  getAutographDisplayLabel,
  getProfile,
  handleRequest,
  HttpError,
  json,
  notifyUser,
  optionalString,
  parseJson,
  requireString,
  requireUser,
  stripe,
  supabaseAdmin,
} from '../_shared/utils.ts';
import { sendPrintOrderConfirmationEmail } from '../_shared/order-email.ts';

// Prodigi REST API — https://www.prodigi.com/print-api/docs/reference/
const PRODIGI_API_URL = Deno.env.get('PRODIGI_SANDBOX') === 'true'
  ? 'https://api.sandbox.prodigi.com/v4.0/Orders'
  : 'https://api.prodigi.com/v4.0/Orders';
const PRODIGI_API_KEY = Deno.env.get('PRODIGI_API_KEY') ?? '';

// Kill switch — set PRODIGI_SUBMISSION_ENABLED=false in Supabase secrets to instantly halt new orders
const PRODIGI_SUBMISSION_ENABLED = Deno.env.get('PRODIGI_SUBMISSION_ENABLED') !== 'false';

async function sendAdminAlert(subject: string, body: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const adminEmail = Deno.env.get('ADMIN_ALERT_EMAIL') ?? '';
  if (!apiKey || !adminEmail) {
    console.error('[admin-alert] not configured:', subject, body);
    return;
  }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('ORDER_EMAIL_FROM') ?? 'Ophinia Alerts <noreply@ophinia.com>',
        to: adminEmail,
        subject: `[Ophinia Alert] ${subject}`,
        text: body,
      }),
    });
  } catch (err) {
    console.error('[admin-alert] send failed:', err);
  }
}

// Prodigi SKU for 8×10 photo print
const SKU_8X10 = 'GLOBAL-PHO-8X10';

function isTrustedPrintLayoutUrl(value: string, autographId: string) {
  const bunnyHostname = Deno.env.get('BUNNY_CDN_HOSTNAME') ?? '';
  if (!bunnyHostname) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === bunnyHostname &&
      url.pathname.startsWith('/print_layouts/') &&
      (
        url.pathname.endsWith(`/${autographId}.png`) ||
        new RegExp(`/${autographId}-r\\d+\\.png$`).test(url.pathname)
      )
    );
  } catch {
    return false;
  }
}

type ProdigiRecipient = {
  name: string;
  address: {
    line1: string;
    line2?: string;
    postalOrZipCode: string;
    countryCode: string;
    townOrCity: string;
    stateOrCounty: string;
  };
};

type ProdigiItem = {
  merchantReference: string;
  sku: string;
  copies: number;
  sizing: string;
  attributes?: Record<string, string>;
  assets: { printArea: string; url: string }[];
};

async function submitProdigiOrder(params: {
  merchantReference: string;
  recipient: ProdigiRecipient;
  items: ProdigiItem[];
}): Promise<string> {
  const response = await fetch(PRODIGI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': PRODIGI_API_KEY,
    },
    body: JSON.stringify({
      merchantReference: params.merchantReference,
      shippingMethod: 'Budget',
      recipient: params.recipient,
      items: params.items,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.detail ?? data?.title ?? JSON.stringify(data) ?? 'Prodigi order submission failed.';
    throw new HttpError(502, `Prodigi error (${response.status}): ${message}`);
  }

  const orderId = data?.order?.id;
  if (!orderId || typeof orderId !== 'string') {
    throw new HttpError(502, 'Prodigi did not return an order ID.');
  }

  return orderId;
}

Deno.serve((req) =>
  handleRequest(async (request) => {
    // Kill switch — instantly halt new print orders without redeploy
    assert(PRODIGI_SUBMISSION_ENABLED, 503, 'Print orders are temporarily unavailable. Please try again later.');

    // PRODIGI_SANDBOX only controls which Prodigi API URL is used — auth and payment
    // validation are always enforced regardless of sandbox mode.
    const body = await parseJson(request);
    const user = await requireUser(request);

    const requestedAutographIds = Array.isArray(body.autograph_ids)
      ? body.autograph_ids
      : [body.autograph_id];
    const autographIds = Array.from(new Set(
      requestedAutographIds
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    ));
    assert(autographIds.length >= 1, 400, 'autograph_id required.');
    assert(autographIds.length <= 5, 400, 'You can order up to 5 prints at a time.');
    const autographId = autographIds[0];
    const isBundle = autographIds.length > 1;
    const paymentEventId = requireString(body.payment_event_id, 'payment_event_id');

    const requestedQuantity = typeof body.quantity === 'number' && body.quantity >= 1 && body.quantity <= 5
      ? Math.floor(body.quantity)
      : 1;
    const quantity = isBundle ? autographIds.length : requestedQuantity;

    // Shipping details
    const shippingName = requireString(body.shipping_name, 'shipping_name');
    const shippingLine1 = requireString(body.shipping_line1, 'shipping_line1');
    const shippingLine2 = optionalString(body.shipping_line2);
    const shippingCity = requireString(body.shipping_city, 'shipping_city');
    const shippingState = requireString(body.shipping_state, 'shipping_state');
    const shippingZip = requireString(body.shipping_zip, 'shipping_zip');

    // image_url is optional — if not provided, the Railway render worker is called automatically
    const rawImageUrlProvided = typeof body.image_url === 'string' && body.image_url.trim().length > 0
      ? body.image_url.trim()
      : null;
    const imageUrlProvided = !isBundle && rawImageUrlProvided && isTrustedPrintLayoutUrl(rawImageUrlProvided, autographId)
      ? rawImageUrlProvided
      : null;

    const [profile, autographRows] = await Promise.all([
      getProfile(user.id),
      autographIds.length === 1
        ? getAutographForUpdate(autographId).then((autograph) => [autograph])
        : supabaseAdmin
            .from('autographs')
            .select('id, creator_id, owner_id, status, visibility, prints_enabled, print_limit')
            .in('id', autographIds)
            .then(({ data, error }) => {
              if (error) throw new HttpError(500, error.message);
              return data ?? [];
            }),
    ]);
    assert(autographRows.length === autographIds.length, 404, 'One or more autographs were not found.');
    const autographById = new Map(autographRows.map((autograph: any) => [autograph.id, autograph]));
    const autographs = autographIds.map((id) => autographById.get(id));
    const autograph = autographs[0];
    const ownerId = autograph.owner_id;
    const creatorId = autograph.creator_id;

    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(profile.is_creator === true, 403, 'You must be 18 or older to order prints.');
    for (const candidate of autographs) {
      assert(candidate.creator_id === creatorId, 409, 'All selected prints must be from the same creator.');
      assert(candidate.owner_id === ownerId, 409, 'All selected prints must be from the same creator.');
      assert(candidate.status === 'active', 409, 'Autograph is not active.');
      assert(candidate.visibility === 'public' || candidate.owner_id === user.id, 403, 'This autograph is not available for prints.');
      assert(candidate.owner_id === user.id || candidate.prints_enabled === true, 409, 'Prints are not available for this autograph.');
    }
    await assertUsersNotBlocked(user.id, creatorId, 'You cannot purchase a print from this creator.');
    await assertUsersNotBlocked(user.id, ownerId, 'You cannot purchase a print from this owner.');

    const { data, error: paymentEventError } = await supabaseAdmin
      .from('payment_events')
      .select('id, user_id, autograph_id, purpose, status, amount_cents, stripe_payment_intent_id, provider_metadata')
      .eq('id', paymentEventId)
      .single();

    if (paymentEventError || !data) {
      throw new HttpError(404, 'Payment event not found.');
    }

    const paymentEvent: {
      id: string;
      user_id: string | null;
      autograph_id: string | null;
      purpose: string;
      status: string;
      amount_cents: number;
      stripe_payment_intent_id: string | null;
      provider_metadata: Record<string, unknown> | null;
    } = data;

    assert(paymentEvent.user_id === user.id, 403, 'Payment event does not belong to this user.');
    assert(paymentEvent.autograph_id === autographId, 409, 'Payment event does not match this autograph.');
    const paidAutographIds = Array.isArray(paymentEvent.provider_metadata?.autograph_ids)
      ? paymentEvent.provider_metadata.autograph_ids.filter((value): value is string => typeof value === 'string')
      : [paymentEvent.autograph_id].filter((value): value is string => typeof value === 'string');
    assert(
      paidAutographIds.length === autographIds.length && paidAutographIds.every((id, index) => id === autographIds[index]),
      409,
      'Payment event does not match selected prints.'
    );
    assert(paymentEvent.purpose === 'print_bundle', 409, 'Payment event purpose mismatch.');
    assert(paymentEvent.amount_cents > 0, 409, 'Payment amount mismatch.');
    assert(typeof paymentEvent.stripe_payment_intent_id === 'string', 409, 'Payment intent reference missing.');

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentEvent.stripe_payment_intent_id);
    assert(
      paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing',
      409,
      'Payment has not completed.'
    );

    // Check for an existing print record by payment event only (idempotency).
    // Owners are allowed to order multiple prints — each gets a new sequence number.
    const { data: existingPrint } = await supabaseAdmin
      .from('autograph_prints')
      .select('id, fulfillment_status, vendor_order_id')
      .eq('payment_event_id', paymentEventId)
      .limit(1)
      .maybeSingle();

    // If already submitted to vendor, return success — idempotent
    if (existingPrint?.vendor_order_id) {
      return json({
        print: {
          id: existingPrint.id,
          vendor_order_id: existingPrint.vendor_order_id,
          fulfillment_status: existingPrint.fulfillment_status,
          reused: true,
        },
      });
    }

    const now = new Date().toISOString();
    let printRows: { id: string; autograph_id: string }[] = [];

    if (existingPrint) {
      const { data: existingPrintRows, error: existingRowsError } = await supabaseAdmin
        .from('autograph_prints')
        .select('id, autograph_id')
        .eq('payment_event_id', paymentEvent.id)
        .order('created_at', { ascending: true });

      if (existingRowsError) throw new HttpError(500, 'Could not load existing print records.');
      printRows = existingPrintRows ?? [];
      const { error: updateError } = await supabaseAdmin
        .from('autograph_prints')
        .update({
          payment_intent_id: paymentEvent.stripe_payment_intent_id,
          payment_event_id: paymentEvent.id,
          payment_confirmed_at: now,
          shipping_name: shippingName,
          shipping_line1: shippingLine1,
          shipping_line2: shippingLine2,
          shipping_city: shippingCity,
          shipping_state: shippingState,
          shipping_zip: shippingZip,
          fulfillment_status: 'payment_confirmed',
        })
        .eq('payment_event_id', paymentEvent.id);

      if (updateError) throw new HttpError(500, 'Could not update print record.');
    } else {
      const rows: Record<string, unknown>[] = [];
      for (const candidate of autographs) {
        const copiesForAutograph = isBundle ? 1 : quantity;
        const { data: lastPrint } = await supabaseAdmin
          .from('autograph_prints')
          .select('print_sequence_number')
          .eq('autograph_id', candidate.id)
          .order('print_sequence_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        const baseSequence = (lastPrint?.print_sequence_number ?? 0) + 1;
        assert(
          typeof candidate.print_limit !== 'number' || baseSequence + copiesForAutograph - 1 <= candidate.print_limit,
          409,
          'This autograph has reached its print limit.'
        );

        for (let i = 0; i < copiesForAutograph; i += 1) {
          rows.push({
            autograph_id: candidate.id,
            owner_id_at_print: user.id,
            print_sequence_number: baseSequence + i,
            status: 'created',
            payment_intent_id: paymentEvent.stripe_payment_intent_id,
            payment_event_id: paymentEvent.id,
            payment_confirmed_at: now,
            shipping_name: shippingName,
            shipping_line1: shippingLine1,
            shipping_line2: shippingLine2,
            shipping_city: shippingCity,
            shipping_state: shippingState,
            shipping_zip: shippingZip,
            fulfillment_status: 'payment_confirmed',
          });
        }
      }

      const { data: newPrints, error: insertError } = await supabaseAdmin
        .from('autograph_prints')
        .insert(rows)
        .select('id, autograph_id');

      if (insertError || !newPrints?.length) throw new HttpError(500, 'Could not create print record.');
      printRows = newPrints;
    }

    assert(printRows.length > 0, 500, 'Could not create print record.');

    // Mark payment event as captured.
    // NOTE: owner ledger row is inserted below, after Prodigi confirms the order,
    // so we never owe a payout for a print that was never actually submitted.
    await supabaseAdmin
      .from('payment_events')
      .update({ status: 'captured' })
      .eq('id', paymentEventId);

    // Generate print layouts via the Railway print-renderer service.
    const rendererUrl = Deno.env.get('PRINT_RENDERER_URL') ?? '';
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
    async function getLayoutUrl(print: { id: string; autograph_id: string }, providedUrl: string | null) {
      if (providedUrl && print.autograph_id === autographId) return providedUrl;
      console.log('[submit-print-order] calling print-renderer for', print.autograph_id, print.id);
      assert(rendererUrl.length > 0, 500, 'PRINT_RENDERER_URL is not configured.');
      const layoutResponse = await fetch(`${rendererUrl}/render`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret,
        },
        body: JSON.stringify({ autograph_id: print.autograph_id, print_id: print.id, internal_secret: internalSecret }),
      });
      const layoutText = await layoutResponse.text();
      console.log('[submit-print-order] print-renderer status:', layoutResponse.status, 'body:', layoutText);
      if (!layoutResponse.ok) {
        throw new HttpError(500, `Layout generation failed: ${layoutResponse.status} — ${layoutText}`);
      }
      let layoutData: any;
      try { layoutData = JSON.parse(layoutText); } catch { layoutData = {}; }
      const imageUrl = layoutData?.print_layout_url;
      assert(typeof imageUrl === 'string' && imageUrl.length > 0, 500, 'Print layout URL missing from print-renderer response.');
      return imageUrl;
    }

    // Submit order to Prodigi
    const recipient: ProdigiRecipient = {
      name: shippingName,
      address: {
        line1: shippingLine1,
        ...(shippingLine2 ? { line2: shippingLine2 } : {}),
        postalOrZipCode: shippingZip,
        countryCode: 'US',
        townOrCity: shippingCity,
        stateOrCounty: shippingState,
      },
    };

    const layoutRows = await Promise.all(printRows.map(async (print, index) => ({
      ...print,
      layoutUrl: await getLayoutUrl(print, index === 0 ? imageUrlProvided : null),
    })));
    const allPrintIds = layoutRows.map((print) => print.id);
    const primaryPrintId = allPrintIds[0];
    const items: ProdigiItem[] = layoutRows.map((print) => ({
      merchantReference: `${print.id}-8x10`,
      sku: SKU_8X10,
      copies: 1,
      sizing: 'fillPrintArea',
      attributes: { finish: 'lustre' },
      assets: [{ printArea: 'default', url: print.layoutUrl }],
    }));

    let vendorOrderId: string;
    try {
      vendorOrderId = await submitProdigiOrder({
        merchantReference: primaryPrintId,
        recipient,
        items,
      });
    } catch (error: any) {
      // Mark fulfillment as failed so admin can retry
      await supabaseAdmin
        .from('autograph_prints')
        .update({ fulfillment_status: 'failed' })
        .in('id', allPrintIds);

      // Alert admin — payment succeeded but Prodigi submission failed
      await sendAdminAlert(
        'Prodigi submission failed after successful payment',
        `Print IDs: ${allPrintIds.join(', ')}\nAutograph IDs: ${autographIds.join(', ')}\nUser ID: ${user.id}\nPayment Event: ${paymentEventId}\nError: ${error?.message ?? String(error)}\n\nThe payment has been captured but the order was NOT sent to Prodigi. Manual retry required.`
      );

      throw error;
    }

    // Record the vendor order ID and mark each print as submitted with its own layout URL.
    await Promise.all(layoutRows.map((print) =>
      supabaseAdmin
        .from('autograph_prints')
        .update({
          print_layout_url: print.layoutUrl,
          vendor_order_id: vendorOrderId,
          vendor_submitted_at: new Date().toISOString(),
          fulfillment_status: 'submitted',
        })
        .eq('id', print.id)
    ));

    // Now that Prodigi has confirmed the order, record the owner payout in the ledger.
    // Using royalty_type 'print_owner' (distinct from the trigger-inserted 'print' creator royalty)
    // so both can coexist for the same print when creator_id === owner_id.
    // TODO: when Stripe Connect onboarding is built, verify account.charges_enabled before
    //       setting transfer_data on the PaymentIntent; until then owner_connect_scheduled
    //       will always be false for accounts that haven't completed onboarding.
    const meta = paymentEvent.provider_metadata ?? {};
    const ownerConnectScheduled = meta.owner_connect_scheduled === true;
    const ownerPayoutCents = typeof meta.owner_payout_cents === 'number' ? meta.owner_payout_cents : 0;
    const payoutOwnerId = typeof meta.owner_id === 'string' ? meta.owner_id : null;

    if (!ownerConnectScheduled && ownerPayoutCents > 0 && payoutOwnerId) {
      const perPrintPayout = Math.round(ownerPayoutCents / allPrintIds.length);
      await supabaseAdmin
        .from('royalties_ledger')
        .upsert(
          allPrintIds.map((pid) => ({
            creator_id: payoutOwnerId,
            royalty_type: 'print_owner',
            print_id: pid,
            autograph_id: layoutRows.find((print) => print.id === pid)?.autograph_id ?? autographId,
            print_royalty_cents_snapshot: perPrintPayout,
            royalty_amount_cents: perPrintPayout,
          })),
          { onConflict: 'print_id,creator_id,royalty_type', ignoreDuplicates: true }
        );
    }

    // Notify the collector
    const label = isBundle
      ? `${layoutRows.length} official Ophinia prints`
      : await getAutographDisplayLabel(autographId);
    await sendPrintOrderConfirmationEmail({
      to: user.email,
      orderReference: primaryPrintId,
      momentLabel: label,
      quantity: allPrintIds.length,
      totalCents: paymentEvent.amount_cents,
      shipping: {
        name: shippingName,
        line1: shippingLine1,
        line2: shippingLine2,
        city: shippingCity,
        state: shippingState,
        zip: shippingZip,
        country: 'US',
      },
    });
    await notifyUser(
      user.id,
      'Print Order Submitted',
      'Your official Ophinia print has been submitted for production.'
    );

    return json({
      print: {
        id: primaryPrintId,
        vendor_order_id: vendorOrderId,
        fulfillment_status: 'submitted',
        quantity: allPrintIds.length,
        reused: false,
      },
    });
  }, req)
);

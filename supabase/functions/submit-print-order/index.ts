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
    const isSandbox = Deno.env.get('PRODIGI_SANDBOX') === 'true';
    const body = await parseJson(request);

    // In sandbox mode accept a sandbox_user_id in the body to bypass JWT auth
    // (needed because ES256 tokens are not supported by the edge function runtime in some versions)
    let user: { id: string; email: string | null };
    if (isSandbox && typeof body.sandbox_user_id === 'string') {
      user = { id: body.sandbox_user_id, email: null };
    } else {
      user = await requireUser(request);
    }

    const autographId = requireString(body.autograph_id, 'autograph_id');
    const paymentEventId = requireString(body.payment_event_id, 'payment_event_id');
    const quantity = typeof body.quantity === 'number' && body.quantity >= 1 && body.quantity <= 5
      ? Math.floor(body.quantity)
      : 1;

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
    const imageUrlProvided = rawImageUrlProvided && isTrustedPrintLayoutUrl(rawImageUrlProvided, autographId)
      ? rawImageUrlProvided
      : null;

    const [autograph, profile] = await Promise.all([
      getAutographForUpdate(autographId),
      getProfile(user.id),
    ]);

    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(profile.is_creator === true, 403, 'You must be 18 or older to order prints.');
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.visibility === 'public' || autograph.owner_id === user.id, 403, 'This autograph is not available for prints.');
    assert(autograph.owner_id === user.id || autograph.prints_enabled === true, 409, 'Prints are not available for this autograph.');
    await assertUsersNotBlocked(user.id, autograph.creator_id, 'You cannot purchase a print from this creator.');
    await assertUsersNotBlocked(user.id, autograph.owner_id, 'You cannot purchase a print from this owner.');

    let paymentEvent: {
      id: string;
      user_id: string | null;
      autograph_id: string | null;
      purpose: string;
      status: string;
      amount_cents: number;
      stripe_payment_intent_id: string | null;
      provider_metadata: Record<string, unknown> | null;
    } | null = null;

    // In sandbox mode, payment validation is bypassed for test orders
    if (!isSandbox) {
      const { data, error: paymentEventError } = await supabaseAdmin
        .from('payment_events')
        .select('id, user_id, autograph_id, purpose, status, amount_cents, stripe_payment_intent_id, provider_metadata')
        .eq('id', paymentEventId)
        .single();

      if (paymentEventError || !data) {
        throw new HttpError(404, 'Payment event not found.');
      }

      paymentEvent = data;

      assert(paymentEvent.user_id === user.id, 403, 'Payment event does not belong to this user.');
      assert(paymentEvent.autograph_id === autographId, 409, 'Payment event does not match this autograph.');
      assert(paymentEvent.purpose === 'print_bundle', 409, 'Payment event purpose mismatch.');
      assert(paymentEvent.amount_cents > 0, 409, 'Payment amount mismatch.');
      assert(typeof paymentEvent.stripe_payment_intent_id === 'string', 409, 'Payment intent reference missing.');

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentEvent.stripe_payment_intent_id);
      assert(
        paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing',
        409,
        'Payment has not completed.'
      );
    }

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
    let printId: string;
    let additionalPrintIds: string[] = [];

    if (existingPrint) {
      // Reuse existing record — update with latest payment and shipping details
      const { error: updateError } = await supabaseAdmin
        .from('autograph_prints')
        .update({
          payment_intent_id: isSandbox ? null : paymentEvent!.stripe_payment_intent_id,
          payment_event_id: isSandbox ? null : paymentEvent!.id,
          payment_confirmed_at: now,
          shipping_name: shippingName,
          shipping_line1: shippingLine1,
          shipping_line2: shippingLine2,
          shipping_city: shippingCity,
          shipping_state: shippingState,
          shipping_zip: shippingZip,
          fulfillment_status: 'payment_confirmed',
        })
        .eq('id', existingPrint.id);

      if (updateError) throw new HttpError(500, 'Could not update print record.');
      printId = existingPrint.id;
    } else {
      // Determine next sequence number
      const { data: lastPrint } = await supabaseAdmin
        .from('autograph_prints')
        .select('print_sequence_number')
        .eq('autograph_id', autographId)
        .order('print_sequence_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const baseSequence = (lastPrint?.print_sequence_number ?? 0) + 1;
      assert(
        typeof autograph.print_limit !== 'number' || baseSequence + quantity - 1 <= autograph.print_limit,
        409,
        'This autograph has reached its print limit.'
      );

      const rows = Array.from({ length: quantity }, (_, i) => ({
        autograph_id: autographId,
        owner_id_at_print: user.id,
        print_sequence_number: baseSequence + i,
        status: 'created',
        payment_intent_id: isSandbox ? null : paymentEvent!.stripe_payment_intent_id,
        payment_event_id: isSandbox ? null : paymentEvent!.id,
        payment_confirmed_at: now,
        shipping_name: shippingName,
        shipping_line1: shippingLine1,
        shipping_line2: shippingLine2,
        shipping_city: shippingCity,
        shipping_state: shippingState,
        shipping_zip: shippingZip,
        fulfillment_status: 'payment_confirmed',
      }));

      const { data: newPrints, error: insertError } = await supabaseAdmin
        .from('autograph_prints')
        .insert(rows)
        .select('id');

      if (insertError || !newPrints?.length) throw new HttpError(500, 'Could not create print record.');
      printId = newPrints[0].id;
      additionalPrintIds = newPrints.slice(1).map((p: { id: string }) => p.id);
    }

    // Mark payment event as captured (skipped in sandbox mode — no real payment event exists)
    if (!isSandbox) {
      await supabaseAdmin
        .from('payment_events')
        .update({ status: 'captured' })
        .eq('id', paymentEventId);
      // NOTE: owner ledger row is inserted below, after Prodigi confirms the order,
      // so we never owe a payout for a print that was never actually submitted.
    }

    // Generate print layout via the Railway print-renderer service
    let imageUrl = imageUrlProvided;
    if (!imageUrl) {
      console.log('[submit-print-order] calling print-renderer for', autographId, printId);
      const rendererUrl = Deno.env.get('PRINT_RENDERER_URL') ?? '';
      const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
      assert(rendererUrl.length > 0, 500, 'PRINT_RENDERER_URL is not configured.');
      const layoutResponse = await fetch(`${rendererUrl}/render`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret,
        },
        body: JSON.stringify({ autograph_id: autographId, print_id: printId, internal_secret: internalSecret }),
      });
      const layoutText = await layoutResponse.text();
      console.log('[submit-print-order] print-renderer status:', layoutResponse.status, 'body:', layoutText);
      if (!layoutResponse.ok) {
        throw new HttpError(500, `Layout generation failed: ${layoutResponse.status} — ${layoutText}`);
      }
      let layoutData: any;
      try { layoutData = JSON.parse(layoutText); } catch { layoutData = {}; }
      imageUrl = layoutData?.print_layout_url;
      assert(typeof imageUrl === 'string' && imageUrl.length > 0, 500, 'Print layout URL missing from print-renderer response.');
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

    const allPrintIds = [printId, ...additionalPrintIds];
    const items: ProdigiItem[] = [
      {
        merchantReference: `${printId}-8x10`,
        sku: SKU_8X10,
        copies: allPrintIds.length,
        sizing: 'fillPrintArea',
        attributes: { finish: 'lustre' },
        assets: [{ printArea: 'default', url: imageUrl }],
      },
    ];

    let vendorOrderId: string;
    try {
      vendorOrderId = await submitProdigiOrder({
        merchantReference: printId,
        recipient,
        items,
      });
    } catch (error: any) {
      // Mark fulfillment as failed so admin can retry
      await supabaseAdmin
        .from('autograph_prints')
        .update({ fulfillment_status: 'failed' })
        .in('id', allPrintIds);

      throw error;
    }

    // Record the vendor order ID and mark as submitted
    await supabaseAdmin
      .from('autograph_prints')
      .update({
        print_layout_url: imageUrl,
        vendor_order_id: vendorOrderId,
        vendor_submitted_at: new Date().toISOString(),
        fulfillment_status: 'submitted',
      })
      .in('id', allPrintIds);

    // Now that Prodigi has confirmed the order, record the owner payout in the ledger.
    // Using royalty_type 'print_owner' (distinct from the trigger-inserted 'print' creator royalty)
    // so both can coexist for the same print when creator_id === owner_id.
    // TODO: when Stripe Connect onboarding is built, verify account.charges_enabled before
    //       setting transfer_data on the PaymentIntent; until then owner_connect_scheduled
    //       will always be false for accounts that haven't completed onboarding.
    if (!isSandbox) {
      const meta = paymentEvent?.provider_metadata ?? {};
      const ownerConnectScheduled = meta.owner_connect_scheduled === true;
      const ownerPayoutCents = typeof meta.owner_payout_cents === 'number' ? meta.owner_payout_cents : 0;
      const ownerId = typeof meta.owner_id === 'string' ? meta.owner_id : null;

      if (!ownerConnectScheduled && ownerPayoutCents > 0 && ownerId) {
        const perPrintPayout = Math.round(ownerPayoutCents / allPrintIds.length);
        await supabaseAdmin
          .from('royalties_ledger')
          .upsert(
            allPrintIds.map((pid) => ({
              creator_id: ownerId,
              royalty_type: 'print_owner',
              print_id: pid,
              autograph_id: autographId,
              print_royalty_cents_snapshot: perPrintPayout,
              royalty_amount_cents: perPrintPayout,
            })),
            { onConflict: 'print_id,creator_id,royalty_type', ignoreDuplicates: true }
          );
      }
    }

    // Notify the collector
    const label = await getAutographDisplayLabel(autographId);
    await sendPrintOrderConfirmationEmail({
      to: user.email,
      orderReference: printId,
      momentLabel: label,
      quantity: allPrintIds.length,
      totalCents: paymentEvent?.amount_cents ?? null,
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
        id: printId,
        vendor_order_id: vendorOrderId,
        fulfillment_status: 'submitted',
        quantity: allPrintIds.length,
        reused: false,
      },
    });
  }, req)
);

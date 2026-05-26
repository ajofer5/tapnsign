import {
  assert,
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

// Prodigi REST API — https://www.prodigi.com/print-api/docs/reference/
const PRODIGI_API_URL = Deno.env.get('PRODIGI_SANDBOX') === 'true'
  ? 'https://api.sandbox.prodigi.com/v4.0/Orders'
  : 'https://api.prodigi.com/v4.0/Orders';
const PRODIGI_API_KEY = Deno.env.get('PRODIGI_API_KEY') ?? '';

// Prodigi SKU for 8×12 photo print
const SKU_8X12 = 'GLOBAL-PHO-8X12';

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
      shippingMethod: 'Standard',
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

    // Shipping details
    const shippingName = requireString(body.shipping_name, 'shipping_name');
    const shippingLine1 = requireString(body.shipping_line1, 'shipping_line1');
    const shippingLine2 = optionalString(body.shipping_line2);
    const shippingCity = requireString(body.shipping_city, 'shipping_city');
    const shippingState = requireString(body.shipping_state, 'shipping_state');
    const shippingZip = requireString(body.shipping_zip, 'shipping_zip');

    // image_url_8x12 is optional — if not provided, generate-print-layout is called automatically
    const imageUrl8x12Provided = typeof body.image_url_8x12 === 'string' && body.image_url_8x12.trim().length > 0
      ? body.image_url_8x12.trim()
      : null;

    const [autograph, profile] = await Promise.all([
      getAutographForUpdate(autographId),
      getProfile(user.id),
    ]);

    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.owner_id === user.id, 403, 'You do not own this autograph.');

    let paymentEvent: {
      id: string;
      user_id: string | null;
      autograph_id: string | null;
      purpose: string;
      status: string;
      amount_cents: number;
      stripe_payment_intent_id: string | null;
    } | null = null;

    // In sandbox mode, payment validation is bypassed for test orders
    if (!isSandbox) {
      const { data, error: paymentEventError } = await supabaseAdmin
        .from('payment_events')
        .select('id, user_id, autograph_id, purpose, status, amount_cents, stripe_payment_intent_id')
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

    // Check for an existing print record by payment event (idempotency) OR by autograph+owner (retry)
    const [{ data: printByPayment }, { data: printByOwner }] = await Promise.all([
      supabaseAdmin
        .from('autograph_prints')
        .select('id, fulfillment_status, vendor_order_id')
        .eq('payment_event_id', paymentEventId)
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('autograph_prints')
        .select('id, fulfillment_status, vendor_order_id')
        .eq('autograph_id', autographId)
        .eq('owner_id_at_print', user.id)
        .limit(1)
        .maybeSingle(),
    ]);

    const existingPrint = printByPayment ?? printByOwner ?? null;

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

      const nextSequence = (lastPrint?.print_sequence_number ?? 0) + 1;

      const { data: newPrint, error: insertError } = await supabaseAdmin
        .from('autograph_prints')
        .insert({
          autograph_id: autographId,
          owner_id_at_print: user.id,
          print_sequence_number: nextSequence,
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
        })
        .select('id')
        .single();

      if (insertError || !newPrint) throw new HttpError(500, 'Could not create print record.');
      printId = newPrint.id;
    }

    // Mark payment event as captured (skipped in sandbox mode — no real payment event exists)
    if (!isSandbox) {
      await supabaseAdmin
        .from('payment_events')
        .update({ status: 'captured' })
        .eq('id', paymentEventId);
    }

    // Generate print layout image via render worker if not already provided
    let imageUrl8x12 = imageUrl8x12Provided;
    if (!imageUrl8x12) {
      const renderWorkerUrl = Deno.env.get('RENDER_WORKER_URL') ?? '';
      const renderSecret = Deno.env.get('RENDER_SECRET') ?? '';
      assert(renderWorkerUrl.length > 0, 500, 'RENDER_WORKER_URL is not configured.');

      console.log('[submit-print-order] calling render worker for', autographId, printId);
      const renderRes = await fetch(`${renderWorkerUrl}/render-print-layout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-render-secret': renderSecret,
        },
        body: JSON.stringify({ autograph_id: autographId, print_id: printId }),
      });

      const renderData = await renderRes.json().catch(() => ({}));
      console.log('[submit-print-order] render worker response:', renderRes.status, JSON.stringify(renderData));

      if (!renderRes.ok) {
        throw new HttpError(500, `Layout generation failed: ${renderData?.error ?? renderRes.statusText}`);
      }

      imageUrl8x12 = renderData?.print_layout_url;
      assert(typeof imageUrl8x12 === 'string' && imageUrl8x12.length > 0, 500, `Print layout URL missing from render worker response.`);
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

    const items: ProdigiItem[] = [
      {
        merchantReference: `${printId}-8x12`,
        sku: SKU_8X12,
        copies: 1,
        sizing: 'fillPrintArea',
        attributes: { finish: 'lustre' },
        assets: [{ printArea: 'default', url: imageUrl8x12 }],
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
        .eq('id', printId);

      throw error;
    }

    // Record the vendor order ID and mark as submitted
    await supabaseAdmin
      .from('autograph_prints')
      .update({
        vendor_order_id: vendorOrderId,
        vendor_submitted_at: new Date().toISOString(),
        fulfillment_status: 'submitted',
      })
      .eq('id', printId);

    // Notify the collector
    const label = await getAutographDisplayLabel(autographId);
    await notifyUser(
      user.id,
      'Print Order Submitted',
      `Your official print of ${label} is on its way! You'll receive a shipping confirmation from our print partner.`
    );

    return json({
      print: {
        id: printId,
        vendor_order_id: vendorOrderId,
        fulfillment_status: 'submitted',
        reused: false,
      },
    });
  }, req)
);

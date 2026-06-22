import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteAdminSupabaseClient } from '../../../lib/supabase';
import { sendPrintOrderConfirmationEmail } from '../../../lib/order-email';

export const runtime = 'nodejs';

async function sendAdminAlert(subject: string, body: string) {
  const apiKey = process.env.RESEND_API_KEY ?? '';
  const adminEmail = process.env.ADMIN_ALERT_EMAIL ?? '';
  if (!apiKey || !adminEmail) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.ORDER_EMAIL_FROM ?? 'Ophinia Alerts <noreply@ophinia.com>',
        to: adminEmail,
        subject: `[Ophinia Alert] ${subject}`,
        text: body,
      }),
    });
  } catch { /* best-effort */ }
}

const SKU_8X10 = 'GLOBAL-PHO-8X10';

function getStripeSecretKey() {
  const value = process.env.STRIPE_SECRET_KEY;
  if (!value) throw new Error('STRIPE_SECRET_KEY is required.');
  return value;
}

function getProdigiUrl() {
  return process.env.PRODIGI_SANDBOX === 'true'
    ? 'https://api.sandbox.prodigi.com/v4.0/Orders'
    : 'https://api.prodigi.com/v4.0/Orders';
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function retrieveStripeCheckoutSession(sessionId: string) {
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent&expand[]=payment_intent.latest_charge`,
    {
      headers: { Authorization: `Bearer ${getStripeSecretKey()}` },
      cache: 'no-store',
    }
  );
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data?.error?.message ?? data?.raw ?? `Stripe session retrieval failed (${response.status})`);
  }
  return data;
}

function normalizeAddress(raw: any) {
  if (!raw) return null;
  const line1 = typeof raw.line1 === 'string' ? raw.line1.trim() : '';
  const city = typeof raw.city === 'string' ? raw.city.trim() : '';
  const state = typeof raw.state === 'string' ? raw.state.trim() : '';
  const postalCode = typeof raw.postal_code === 'string'
    ? raw.postal_code.trim()
    : typeof raw.postalOrZipCode === 'string'
      ? raw.postalOrZipCode.trim()
      : '';
  const country = typeof raw.country === 'string' ? raw.country.trim() : 'US';

  if (!line1 || !city || !state || !postalCode) return null;

  return {
    line1,
    line2: typeof raw.line2 === 'string' && raw.line2.trim() ? raw.line2.trim() : null,
    city,
    state,
    postal_code: postalCode,
    country: country || 'US',
  };
}

function normalizeShippingCandidate(candidate: any) {
  const address = normalizeAddress(candidate?.address ?? candidate);
  const name = typeof candidate?.name === 'string' && candidate.name.trim()
    ? candidate.name.trim()
    : null;
  if (!address) return null;
  return { name, address };
}

function getSavedOrderShipping(order: any) {
  const address = normalizeAddress({
    line1: order.shipping_line1,
    line2: order.shipping_line2,
    city: order.shipping_city,
    state: order.shipping_state,
    postal_code: order.shipping_zip,
    country: order.shipping_country,
  });
  const name = typeof order.shipping_name === 'string' && order.shipping_name.trim()
    ? order.shipping_name.trim()
    : null;
  if (!address) return null;
  return { name, address };
}

function getCheckoutShipping(session: any, order: any) {
  const paymentIntent = typeof session.payment_intent === 'object' ? session.payment_intent : null;
  const latestCharge = typeof paymentIntent?.latest_charge === 'object' ? paymentIntent.latest_charge : null;

  const candidates = [
    session.shipping_details,
    session.shipping,
    session.collected_information?.shipping_details,
    session.collected_information?.shipping,
    paymentIntent?.shipping,
    latestCharge?.shipping,
    session.customer_details,
    latestCharge?.billing_details,
    getSavedOrderShipping(order),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeShippingCandidate(candidate);
    if (normalized) {
      const fallbackName =
        normalized.name ||
        (typeof session.customer_details?.name === 'string' ? session.customer_details.name.trim() : '') ||
        (typeof latestCharge?.billing_details?.name === 'string' ? latestCharge.billing_details.name.trim() : '') ||
        (typeof order.shipping_name === 'string' ? order.shipping_name.trim() : '');

      if (fallbackName) {
        return { name: fallbackName, address: normalized.address };
      }
    }
  }

  return null;
}

async function getPrintLayoutUrl(autographId: string): Promise<string> {
  const rendererUrl = process.env.PRINT_RENDERER_URL ?? '';
  const internalSecret = process.env.INTERNAL_FUNCTION_SECRET ?? '';
  if (!rendererUrl) throw new Error('PRINT_RENDERER_URL is not configured.');

  const response = await fetch(`${rendererUrl}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': internalSecret,
    },
    body: JSON.stringify({ autograph_id: autographId, internal_secret: internalSecret }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Renderer failed (${response.status}): ${text}`);

  let data: any;
  try { data = JSON.parse(text); } catch { data = {}; }

  const url = data?.print_layout_url;
  if (!url || typeof url !== 'string') throw new Error('Print layout URL missing from renderer response.');
  return url;
}

async function getMomentLabel(supabase: ReturnType<typeof createWebsiteAdminSupabaseClient>, autographId: string) {
  const { data } = await supabase
    .from('autographs')
    .select('creator_sequence_number, creator:creator_id(display_name)')
    .eq('id', autographId)
    .maybeSingle();

  const creatorName = (data as any)?.creator?.display_name ?? 'an Ophinia moment';
  const creatorSequenceNumber = (data as any)?.creator_sequence_number;
  return creatorSequenceNumber != null ? `${creatorName} #${creatorSequenceNumber}` : creatorName;
}

async function submitProdigiOrder(params: {
  orderId: string;
  items: {
    id: string;
    imageUrl: string;
  }[];
  shipping: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
}): Promise<string> {
  const apiKey = process.env.PRODIGI_API_KEY ?? '';
  const response = await fetch(getProdigiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      merchantReference: params.orderId,
      shippingMethod: 'Budget',
      recipient: {
        name: params.shipping.name,
        address: {
          line1: params.shipping.line1,
          ...(params.shipping.line2 ? { line2: params.shipping.line2 } : {}),
          postalOrZipCode: params.shipping.zip,
          countryCode: params.shipping.country,
          townOrCity: params.shipping.city,
          stateOrCounty: params.shipping.state,
        },
      },
      items: [
        ...params.items.map((item) => ({
          merchantReference: `${item.id}-8x10`,
          sku: SKU_8X10,
          copies: 1,
          sizing: 'fillPrintArea',
          attributes: { finish: 'lustre' },
          assets: [{ printArea: 'default', url: item.imageUrl }],
        })),
      ],
    }),
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    const msg = data?.detail ?? data?.title ?? data?.message ?? data?.raw ?? JSON.stringify(data);
    throw new Error(`Prodigi error (${response.status}): ${msg}`);
  }

  const vendorOrderId = data?.order?.id;
  if (!vendorOrderId || typeof vendorOrderId !== 'string') {
    throw new Error('Prodigi did not return an order ID.');
  }
  return vendorOrderId;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : '';

    if (!sessionId || !orderId) {
      return NextResponse.json({ error: 'session_id and order_id required' }, { status: 400 });
    }

    const supabase = createWebsiteAdminSupabaseClient();

    // Fetch our order record
    const { data: order, error: orderError } = await supabase
      .from('web_print_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Already fulfilled — idempotent
    if (order.status === 'submitted' && order.prodigi_order_id) {
      return NextResponse.json({ success: true, prodigi_order_id: order.prodigi_order_id, reused: true });
    }

    // Verify Stripe session payment
    const session = await retrieveStripeCheckoutSession(sessionId);

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 409 });
    }

    // Verify session belongs to this order
    if (order.stripe_checkout_session_id && order.stripe_checkout_session_id !== sessionId) {
      return NextResponse.json({ error: 'Session mismatch' }, { status: 403 });
    }

    const checkoutShipping = getCheckoutShipping(session, order);
    if (!checkoutShipping) {
      console.error('[print-fulfill] shipping missing', {
        session_id: sessionId,
        order_id: orderId,
        has_shipping_details: !!session.shipping_details,
        has_shipping: !!session.shipping,
        has_collected_information: !!session.collected_information,
        has_customer_details_address: !!session.customer_details?.address,
        has_payment_intent_shipping: typeof session.payment_intent === 'object' && !!session.payment_intent?.shipping,
        has_latest_charge_shipping:
          typeof session.payment_intent === 'object' &&
          typeof session.payment_intent?.latest_charge === 'object' &&
          !!session.payment_intent.latest_charge?.shipping,
      });
      return NextResponse.json({ error: 'Shipping address missing' }, { status: 409 });
    }
    const shipping = checkoutShipping.address;
    const shippingName = checkoutShipping.name;

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

    // Mark as paid and store shipping — do this BEFORE the kill-switch check so the order
    // is always persisted as paid even if submission is disabled.
    await supabase
      .from('web_print_orders')
      .update({
        status: 'paid',
        stripe_checkout_session_id: sessionId,
        stripe_payment_intent_id: paymentIntentId,
        buyer_email: session.customer_details?.email ?? order.buyer_email,
        shipping_name: shippingName,
        shipping_line1: shipping.line1 ?? '',
        shipping_line2: shipping.line2 ?? null,
        shipping_city: shipping.city ?? '',
        shipping_state: shipping.state ?? '',
        shipping_zip: shipping.postal_code ?? '',
        shipping_country: shipping.country ?? 'US',
      })
      .eq('id', orderId);

    // Kill switch — checked AFTER marking the order paid so paid orders are never lost.
    // The admin alert ensures manual fulfillment happens.
    if (process.env.PRODIGI_SUBMISSION_ENABLED === 'false') {
      await sendAdminAlert(
        'Web print order held — submission disabled',
        `Order ID: ${orderId}\nStripe Session: ${sessionId}\nPayment Intent: ${paymentIntentId ?? 'unknown'}\n\nThe kill switch (PRODIGI_SUBMISSION_ENABLED=false) was active when this order was fulfilled. The order is saved as "paid". Manual Prodigi submission required.`
      );
      return NextResponse.json(
        { error: 'Print fulfillment is temporarily paused. Your order has been recorded and will be fulfilled shortly.' },
        { status: 503 }
      );
    }

    const orderAutographIds = Array.isArray(order.autograph_ids) && order.autograph_ids.length > 0
      ? order.autograph_ids.filter((value: unknown): value is string => typeof value === 'string')
      : [order.autograph_id].filter((value: unknown): value is string => typeof value === 'string');
    if (orderAutographIds.length < 1 || orderAutographIds.length > 5) {
      return NextResponse.json({ error: 'Invalid print order.' }, { status: 409 });
    }

    // Generate print layouts
    const prodigiItems = await Promise.all(orderAutographIds.map(async (autographId: string, index: number) => ({
      id: `${orderId}-${index + 1}`,
      imageUrl: await getPrintLayoutUrl(autographId),
    })));

    // Submit to Prodigi
    const vendorOrderId = await submitProdigiOrder({
      orderId,
      items: prodigiItems,
      shipping: {
        name: shippingName,
        line1: shipping.line1 ?? '',
        line2: shipping.line2 ?? undefined,
        city: shipping.city ?? '',
        state: shipping.state ?? '',
        zip: shipping.postal_code ?? '',
        country: shipping.country ?? 'US',
      },
    });

    // Mark as submitted
    await supabase
      .from('web_print_orders')
      .update({ status: 'submitted', prodigi_order_id: vendorOrderId })
      .eq('id', orderId);

    const ownerPayoutCents = typeof order.owner_payout_cents === 'number'
      ? order.owner_payout_cents
      : 250 * Math.max(1, orderAutographIds.length);
    const payoutOwnerId = typeof order.owner_id === 'string' ? order.owner_id : null;
    const primaryAutographId = orderAutographIds[0] ?? order.autograph_id;
    if (ownerPayoutCents > 0 && payoutOwnerId && primaryAutographId) {
      const eligibleAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const { error: ledgerError } = await supabase
        .from('royalties_ledger')
        .upsert(
          {
            creator_id: payoutOwnerId,
            royalty_type: 'print_owner',
            web_print_order_id: orderId,
            autograph_id: primaryAutographId,
            print_royalty_cents_snapshot: Math.round(ownerPayoutCents / Math.max(1, orderAutographIds.length)),
            royalty_amount_cents: ownerPayoutCents,
            eligible_at: eligibleAt,
          },
          { onConflict: 'web_print_order_id,creator_id,royalty_type', ignoreDuplicates: true }
        );
      if (ledgerError) {
        await sendAdminAlert(
          'Royalty ledger insert failed — web print order',
          `Order ID: ${orderId}\nOwner: ${payoutOwnerId}\nAmount: $${(ownerPayoutCents / 100).toFixed(2)}\nError: ${ledgerError.message}\n\nThe order was submitted to Prodigi successfully but the creator royalty was NOT recorded. Manual ledger entry required.`
        );
      }
    }

    const momentLabel = orderAutographIds.length > 1
      ? `${orderAutographIds.length} official Ophinia prints`
      : await getMomentLabel(supabase, order.autograph_id);
    await sendPrintOrderConfirmationEmail({
      to: session.customer_details?.email ?? order.buyer_email,
      orderReference: orderId,
      momentLabel,
      quantity: orderAutographIds.length,
      totalCents: order.amount_cents,
      shipping: {
        name: shippingName,
        line1: shipping.line1 ?? '',
        line2: shipping.line2 ?? null,
        city: shipping.city ?? '',
        state: shipping.state ?? '',
        zip: shipping.postal_code ?? '',
        country: shipping.country ?? 'US',
      },
    });

    return NextResponse.json({ success: true, prodigi_order_id: vendorOrderId });
  } catch (err: any) {
    console.error('[print-fulfill]', err);

    // Mark order as failed and alert admin — payment succeeded but fulfillment failed
    try {
      const body = await (request.clone()).json().catch(() => ({}));
      const orderId = typeof body.order_id === 'string' ? body.order_id : null;
      if (orderId) {
        const supabase = createWebsiteAdminSupabaseClient();
        await supabase.from('web_print_orders').update({ status: 'failed' }).eq('id', orderId).eq('status', 'paid');
        await sendAdminAlert(
          'Web print fulfillment failed after payment',
          `Order ID: ${orderId}\nError: ${err?.message ?? String(err)}\n\nThe customer has paid but the order was NOT submitted to Prodigi. Manual fulfillment required.`
        );
      }
    } catch { /* ignore */ }

    return NextResponse.json({ error: err.message ?? 'Fulfillment failed' }, { status: 500 });
  }
}

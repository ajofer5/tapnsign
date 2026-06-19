import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteAdminSupabaseClient } from '../../../lib/supabase';

export const runtime = 'nodejs';

const PRINT_PRICE_CENTS = 1000;
const SHIPPING_CENTS = 699;
const OWNER_PRINT_PAYOUT_CENTS = 250;

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

function getStripeSecretKey() {
  const value = process.env.STRIPE_SECRET_KEY;
  if (!value) throw new Error('STRIPE_SECRET_KEY is required.');
  return value;
}

async function stripePost<T>(path: string, form: Record<string, string>): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? `Stripe error (${response.status})`);
  return data as T;
}

function getSiteUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    // Kill switch — halt new checkout sessions without redeploy
    if (process.env.PRODIGI_SUBMISSION_ENABLED === 'false') {
      return NextResponse.json(
        { error: 'Print orders are temporarily unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const requestedAutographIds: unknown[] = Array.isArray(body.autograph_ids)
      ? body.autograph_ids
      : [body.autograph_id];
    const autographIds: string[] = Array.from(new Set(
      requestedAutographIds
        .filter((value: unknown): value is string => typeof value === 'string')
        .map((value: string) => value.trim())
        .filter(Boolean)
    ));
    const autographId = autographIds[0] ?? '';
    const requestedQuantity = typeof body.quantity === 'number' && body.quantity >= 1 && body.quantity <= 5
      ? Math.floor(body.quantity)
      : 1;
    const quantity = autographIds.length > 1 ? autographIds.length : requestedQuantity;
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    if (!autographId || autographIds.length < 1) {
      return NextResponse.json({ error: 'autograph_id required' }, { status: 400 });
    }
    if (autographIds.length > 5) {
      return NextResponse.json({ error: 'You can order up to 5 prints at a time.' }, { status: 400 });
    }

    const supabase = createWebsiteAdminSupabaseClient();

    // Hourly + daily caps — block new sessions before any Stripe work.
    // Both caps count orders (not individual prints): one payment_events row = one app order;
    // one web_print_orders row = one web order. This matches the app payment-intent cap.
    const HOURLY_ORDER_CAP = parseInt(process.env.HOURLY_PRINT_ORDER_CAP ?? '50', 10);
    const DAILY_ORDER_CAP = parseInt(process.env.DAILY_PRINT_ORDER_CAP ?? '250', 10);
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const [
      { count: appHourCount },
      { count: webHourCount },
      { count: appDayCount },
      { count: webDayCount },
    ] = await Promise.all([
      supabase
        .from('payment_events')
        .select('id', { count: 'exact', head: true })
        .eq('purpose', 'print_bundle')
        .gte('created_at', oneHourAgo),
      supabase
        .from('web_print_orders')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo)
        .in('status', ['pending', 'paid', 'submitted']),
      supabase
        .from('payment_events')
        .select('id', { count: 'exact', head: true })
        .eq('purpose', 'print_bundle')
        .gte('created_at', todayStart.toISOString()),
      supabase
        .from('web_print_orders')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString())
        .in('status', ['pending', 'paid', 'submitted']),
    ]);
    if ((appHourCount ?? 0) + (webHourCount ?? 0) >= HOURLY_ORDER_CAP) {
      await sendAdminAlert(
        'Hourly print order cap reached',
        `The combined hourly cap of ${HOURLY_ORDER_CAP} print orders has been reached. This may indicate a bug or unusual traffic spike.`
      );
      return NextResponse.json(
        { error: 'Order volume is unusually high right now. Please try again in a few minutes.' },
        { status: 503 }
      );
    }
    if ((appDayCount ?? 0) + (webDayCount ?? 0) >= DAILY_ORDER_CAP) {
      await sendAdminAlert(
        'Daily print order cap reached',
        `The combined daily cap of ${DAILY_ORDER_CAP} print orders has been reached. No new checkout sessions will be created today.`
      );
      return NextResponse.json(
        { error: 'Daily order capacity has been reached. Please try again tomorrow.' },
        { status: 503 }
      );
    }

    // Verify selected autographs exist, share one creator, and prints are enabled.
    const { data: autographs, error: autographError } = await supabase
      .from('autographs')
      .select('id, prints_enabled, print_limit, creator_id, owner_id, creator_sequence_number, created_at, creator:creator_id ( display_name )')
      .in('id', autographIds)
      .eq('status', 'active')
      .eq('visibility', 'public');

    if (autographError || !autographs || autographs.length !== autographIds.length) {
      return NextResponse.json({ error: 'Autograph not found' }, { status: 404 });
    }
    const autographById = new Map<string, any>(autographs.map((item: any) => [String(item.id), item]));
    const orderedAutographs = autographIds.map((id) => autographById.get(id)).filter(Boolean);
    const creatorId = String(orderedAutographs[0].creator_id);
    const ownerId = String(orderedAutographs[0].owner_id);
    for (const autograph of orderedAutographs) {
      if (autograph.creator_id !== creatorId || autograph.owner_id !== ownerId) {
        return NextResponse.json({ error: 'All selected prints must be from the same creator.' }, { status: 409 });
      }
      if (!autograph.prints_enabled) {
        return NextResponse.json({ error: 'Prints not available for this autograph' }, { status: 409 });
      }
    }

    const amountCents = PRINT_PRICE_CENTS * quantity + SHIPPING_CENTS;
    const ownerPayoutCents = OWNER_PRINT_PAYOUT_CENTS * quantity;
    const creatorName = (orderedAutographs[0].creator as any)?.display_name ?? 'Creator';
    const bundleItems = orderedAutographs.map((autograph) => ({
      autograph_id: autograph.id,
      creator_sequence_number: autograph.creator_sequence_number ?? null,
      created_at: autograph.created_at,
    }));

    const { data: ownerConnectData } = await supabase
      .from('profiles')
      .select('stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_onboarding_complete')
      .eq('id', ownerId)
      .single();

    const ownerConnectAccountId =
      ownerConnectData?.stripe_connect_onboarding_complete === true &&
      ownerConnectData?.stripe_connect_charges_enabled === true &&
      ownerConnectData?.stripe_connect_payouts_enabled === true &&
      typeof ownerConnectData.stripe_connect_account_id === 'string'
        ? ownerConnectData.stripe_connect_account_id
        : null;

    // Create pending web_print_orders row for idempotency
    const { data: order, error: orderError } = await supabase
      .from('web_print_orders')
      .insert({
        autograph_id: autographId,
        autograph_ids: autographIds,
        bundle_items: bundleItems,
        quantity,
        buyer_email: email || null,
        amount_cents: amountCents,
        status: 'pending',
      })
      .select('id')
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Could not create order' }, { status: 500 });
    }

    const baseUrl = getSiteUrl(request);
    const successUrl = `${baseUrl}/profile/${creatorId}/print-success?session_id={CHECKOUT_SESSION_ID}&order_id=${order.id}`;
    const cancelUrl = `${baseUrl}/profile/${creatorId}`;

    const form: Record<string, string> = {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(PRINT_PRICE_CENTS),
      'line_items[0][price_data][product_data][name]': autographIds.length > 1
        ? `${creatorName} — ${autographIds.length} Official Prints`
        : `${creatorName} — 8×10 Official Print`,
      'line_items[0][quantity]': String(quantity),
      'line_items[1][price_data][currency]': 'usd',
      'line_items[1][price_data][unit_amount]': String(SHIPPING_CENTS),
      'line_items[1][price_data][product_data][name]': 'Standard Shipping (US)',
      'line_items[1][quantity]': '1',
      'shipping_address_collection[allowed_countries][0]': 'US',
      'metadata[autograph_id]': autographId,
      'metadata[autograph_ids]': autographIds.join(','),
      'metadata[quantity]': String(quantity),
      'metadata[web_print_order_id]': order.id,
      'metadata[creator_id]': creatorId,
      'payment_intent_data[metadata][purpose]': 'web_print_order',
      'payment_intent_data[metadata][autograph_id]': autographId,
      'payment_intent_data[metadata][autograph_ids]': autographIds.join(','),
      'payment_intent_data[metadata][web_print_order_id]': order.id,
      'payment_intent_data[metadata][creator_id]': creatorId,
      'payment_intent_data[metadata][owner_id]': ownerId,
      'payment_intent_data[metadata][owner_payout_cents]': String(ownerPayoutCents),
      'payment_intent_data[metadata][owner_connect_scheduled]': ownerConnectAccountId ? 'true' : 'false',
    };

    if (email) form.customer_email = email;
    if (ownerConnectAccountId) {
      form['payment_intent_data[transfer_data][amount]'] = String(ownerPayoutCents);
      form['payment_intent_data[transfer_data][destination]'] = ownerConnectAccountId;
    }

    const session = await stripePost<{ id: string; url: string | null }>('/checkout/sessions', form);

    // Attach session ID to the order row
    await supabase
      .from('web_print_orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id);

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe did not return a checkout URL' }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[print-checkout]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}

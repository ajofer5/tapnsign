import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteAdminSupabaseClient } from '../../../lib/supabase';

export const runtime = 'nodejs';

const PRINT_PRICE_CENTS = 1000;
const SHIPPING_CENTS = 699;

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
    const body = await request.json();
    const autographId = typeof body.autograph_id === 'string' ? body.autograph_id.trim() : '';
    const quantity = typeof body.quantity === 'number' && body.quantity >= 1 && body.quantity <= 5
      ? Math.floor(body.quantity)
      : 1;
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    if (!autographId) {
      return NextResponse.json({ error: 'autograph_id required' }, { status: 400 });
    }

    const supabase = createWebsiteAdminSupabaseClient();

    // Verify autograph exists and prints are enabled
    const { data: autograph, error: autographError } = await supabase
      .from('autographs')
      .select('id, prints_enabled, print_limit, creator_id, creator:creator_id ( display_name )')
      .eq('id', autographId)
      .eq('status', 'active')
      .maybeSingle();

    if (autographError || !autograph) {
      return NextResponse.json({ error: 'Autograph not found' }, { status: 404 });
    }
    if (!autograph.prints_enabled) {
      return NextResponse.json({ error: 'Prints not available for this autograph' }, { status: 409 });
    }

    const amountCents = PRINT_PRICE_CENTS * quantity + SHIPPING_CENTS;
    const creatorName = (autograph.creator as any)?.display_name ?? 'Creator';
    const creatorId = autograph.creator_id;

    // Create pending web_print_orders row for idempotency
    const { data: order, error: orderError } = await supabase
      .from('web_print_orders')
      .insert({
        autograph_id: autographId,
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
      'line_items[0][price_data][product_data][name]': `${creatorName} — 8×10 Official Print`,
      'line_items[0][quantity]': String(quantity),
      'line_items[1][price_data][currency]': 'usd',
      'line_items[1][price_data][unit_amount]': String(SHIPPING_CENTS),
      'line_items[1][price_data][product_data][name]': 'Standard Shipping (US)',
      'line_items[1][quantity]': '1',
      'shipping_address_collection[allowed_countries][0]': 'US',
      'metadata[autograph_id]': autographId,
      'metadata[quantity]': String(quantity),
      'metadata[web_print_order_id]': order.id,
      'metadata[creator_id]': creatorId,
      'payment_intent_data[metadata][purpose]': 'web_print_order',
      'payment_intent_data[metadata][autograph_id]': autographId,
      'payment_intent_data[metadata][web_print_order_id]': order.id,
    };

    if (email) form.customer_email = email;

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

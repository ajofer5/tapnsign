import { NextRequest, NextResponse } from 'next/server';
import { usersAreBlocked } from '../../../../../lib/blocks';
import { createStripeCheckoutSession } from '../../../../../lib/stripe';
import { createWebsiteAdminSupabaseClient } from '../../../../../lib/supabase';
import { verifyWebSessionToken, WEB_SESSION_COOKIE } from '../../../../../lib/web-session';

function getWebsiteBaseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
}

function getUserFromRequest(request: NextRequest) {
  const raw = request.cookies.get(WEB_SESSION_COOKIE)?.value;
  return raw ? verifyWebSessionToken(raw)?.user ?? null : null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const autographId = (await params).id;
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/app/checkout/${autographId}`)}`, request.url));
  }

  const supabase = createWebsiteAdminSupabaseClient();
  const idempotencyKey = `web-checkout:${user.id}:${autographId}`;

  const { data: autograph } = await supabase
    .from('autographs')
    .select(`
      id,
      certificate_id,
      creator_id,
      owner_id,
      status,
      visibility,
      sale_state,
      listing_mode,
      is_for_sale,
      price_cents,
      creator:creator_id ( display_name )
    `)
    .eq('id', autographId)
    .maybeSingle();

  if (
    !autograph ||
    autograph.status !== 'active' ||
    autograph.visibility !== 'public' ||
    autograph.sale_state !== 'fixed' ||
    autograph.listing_mode !== 'buy_now' ||
    !autograph.is_for_sale ||
    typeof autograph.price_cents !== 'number' ||
    autograph.owner_id === user.id
  ) {
    return NextResponse.redirect(new URL(`/app/checkout/${autographId}?error=listing`, request.url));
  }

  if (await usersAreBlocked(user.id, autograph.owner_id)) {
    return NextResponse.redirect(new URL(`/app/checkout/${autographId}?error=blocked`, request.url));
  }

  const nowIso = new Date().toISOString();
  const { data: acceptedOfferLock } = await supabase
    .from('autograph_offers')
    .select('id')
    .eq('autograph_id', autographId)
    .eq('status', 'accepted')
    .is('accepted_transfer_id', null)
    .gt('payment_due_at', nowIso)
    .maybeSingle();

  if (acceptedOfferLock) {
    return NextResponse.redirect(new URL(`/app/checkout/${autographId}?error=locked`, request.url));
  }

  let paymentEventId: string;
  const { data: existingEvent } = await supabase
    .from('payment_events')
    .select('id, amount_cents, provider_metadata')
    .eq('user_id', user.id)
    .eq('autograph_id', autographId)
    .eq('purpose', 'fixed_price_purchase')
    .eq('idempotency_key', idempotencyKey)
    .in('status', ['created', 'requires_action', 'authorized'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingEvent && existingEvent.amount_cents === autograph.price_cents) {
    paymentEventId = existingEvent.id;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('payment_events')
      .insert({
        provider: 'stripe',
        purpose: 'fixed_price_purchase',
        status: 'created',
        user_id: user.id,
        autograph_id: autographId,
        amount_cents: autograph.price_cents,
        currency: 'usd',
        idempotency_key: idempotencyKey,
        provider_metadata: {
          seller_id: autograph.owner_id,
          created_via: 'website_checkout',
        },
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      return NextResponse.redirect(new URL(`/app/checkout/${autographId}?error=payment`, request.url));
    }
    paymentEventId = inserted.id;
  }

  const baseUrl = getWebsiteBaseUrl(request);
  const successUrl = `${baseUrl}/app/checkout/${autographId}/success?session_id={CHECKOUT_SESSION_ID}&payment_event_id=${paymentEventId}`;
  const cancelUrl = `${baseUrl}/app/checkout/${autographId}?canceled=1`;

  try {
    const session = await createStripeCheckoutSession({
      autographId,
      certificateId: (autograph as any).certificate_id,
      creatorName: (autograph as any).creator?.display_name ?? 'TapnSign Creator',
      amountCents: autograph.price_cents,
      successUrl,
      cancelUrl,
      paymentEventId,
      buyerId: user.id,
      sellerId: autograph.owner_id,
    });

    if (!session.url) {
      return NextResponse.redirect(new URL(`/app/checkout/${autographId}?error=stripe`, request.url));
    }

    return NextResponse.redirect(session.url);
  } catch {
    return NextResponse.redirect(new URL(`/app/checkout/${autographId}?error=stripe`, request.url));
  }
}

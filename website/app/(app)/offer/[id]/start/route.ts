import { NextRequest, NextResponse } from 'next/server';
import { usersAreBlocked } from '../../../../../lib/blocks';
import { createStripeCheckoutSession } from '../../../../../lib/stripe';
import {
  createWebsiteAdminSupabaseClient,
} from '../../../../../lib/supabase';
import { getWebSessionUser } from '../../../../../lib/web-auth';

function getWebsiteBaseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
}

function parseOfferCents(raw: FormDataEntryValue | null) {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().replace(/[$,\s]/g, '');
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: autographId } = await params;
  const user = await getWebSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/offer/${autographId}`)}`, request.url));
  }

  const formData = await request.formData();
  const amountCents = parseOfferCents(formData.get('amount'));
  if (!amountCents) {
    return NextResponse.redirect(new URL(`/offer/${autographId}?error=amount`, request.url));
  }

  const nowIso = new Date().toISOString();
  const supabase = createWebsiteAdminSupabaseClient();
  const { data: autograph } = await supabase
    .from('autographs')
    .select(`
      id,
      status,
      owner_id,
      visibility,
      sale_state,
      listing_mode,
      price_cents,
      auto_accept_above,
      auto_decline_below,
      creator:creator_id ( display_name ),
      certificate_id
    `)
    .eq('id', autographId)
    .maybeSingle();

  if (!autograph) {
    return NextResponse.redirect(new URL(`/offer/${autographId}?error=listing`, request.url));
  }
  if (autograph.status !== 'active') {
    return NextResponse.redirect(new URL(`/offer/${autographId}?error=inactive`, request.url));
  }
  if (autograph.owner_id === user.id) {
    return NextResponse.redirect(new URL(`/offer/${autographId}?error=owner`, request.url));
  }
  if (await usersAreBlocked(user.id, autograph.owner_id)) {
    return NextResponse.redirect(new URL(`/offer/${autographId}?error=blocked`, request.url));
  }
  if (autograph.visibility !== 'public' || !(autograph.sale_state === 'fixed' && autograph.listing_mode === 'make_offer')) {
    return NextResponse.redirect(new URL(`/offer/${autographId}?error=listing`, request.url));
  }

  const { data: acceptedLock } = await supabase
    .from('autograph_offers')
    .select('id')
    .eq('autograph_id', autographId)
    .eq('status', 'accepted')
    .is('accepted_transfer_id', null)
    .gt('payment_due_at', nowIso)
    .maybeSingle();

  if (acceptedLock) {
    return NextResponse.redirect(new URL(`/offer/${autographId}?error=locked`, request.url));
  }

  const { data: existingActiveOffer } = await supabase
    .from('autograph_offers')
    .select('id')
    .eq('autograph_id', autographId)
    .eq('buyer_id', user.id)
    .in('status', ['pending', 'on_hold'])
    .maybeSingle();

  if (existingActiveOffer) {
    return NextResponse.redirect(new URL(`/offer/${autographId}?error=existing`, request.url));
  }

  const idempotencyKey = `web-offer-commitment:${user.id}:${autographId}:${amountCents}:${autograph.owner_id}`;
  let paymentEventId: string | null = null;

  const { data: existingEvent } = await supabase
    .from('payment_events')
    .select('id, amount_cents, provider_metadata, stripe_payment_intent_id, status')
    .eq('user_id', user.id)
    .eq('autograph_id', autographId)
    .eq('purpose', 'offer_commitment_authorization')
    .eq('idempotency_key', idempotencyKey)
    .in('status', ['created', 'requires_action', 'authorized'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    existingEvent &&
    existingEvent.amount_cents === amountCents &&
    existingEvent.provider_metadata?.seller_id === autograph.owner_id
  ) {
    paymentEventId = existingEvent.id;

    if (existingEvent.status === 'authorized') {
      return NextResponse.redirect(
        new URL(`/offer/${autographId}/success?payment_event_id=${encodeURIComponent(existingEvent.id)}&amount_cents=${amountCents}`, request.url),
      );
    }
  }

  if (!paymentEventId) {
    const { data: inserted, error: insertError } = await supabase
      .from('payment_events')
      .insert({
        provider: 'stripe',
        purpose: 'offer_commitment_authorization',
        status: 'created',
        user_id: user.id,
        autograph_id: autographId,
        amount_cents: amountCents,
        currency: 'usd',
        idempotency_key: idempotencyKey,
        provider_metadata: {
          seller_id: autograph.owner_id,
          created_via: 'website_offer_commitment_checkout',
        },
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      return NextResponse.redirect(new URL(`/offer/${autographId}?error=payment`, request.url));
    }

    paymentEventId = inserted.id;
  }

  const ensuredPaymentEventId = paymentEventId;
  if (!ensuredPaymentEventId) {
    return NextResponse.redirect(new URL(`/offer/${autographId}?error=payment`, request.url));
  }

  const baseUrl = getWebsiteBaseUrl(request);
  const successUrl = `${baseUrl}/offer/${autographId}/success?session_id={CHECKOUT_SESSION_ID}&payment_event_id=${ensuredPaymentEventId}&amount_cents=${amountCents}`;
  const cancelUrl = `${baseUrl}/offer/${autographId}?canceled=1`;

  try {
    const session = await createStripeCheckoutSession({
      autographId,
      certificateId: (autograph as any).certificate_id,
      creatorName: (autograph as any).creator?.display_name ?? 'Ophinia Creator',
      amountCents,
      successUrl,
      cancelUrl,
      paymentEventId: ensuredPaymentEventId,
      buyerId: user.id,
      sellerId: autograph.owner_id,
      purpose: 'offer_commitment_authorization',
      description: `Offer authorization for ${(autograph as any).creator?.display_name ?? 'Ophinia autograph'}`,
      captureMethod: 'manual',
      extraMetadata: {
        autograph_id: autographId,
      },
    });

    if (!session.url) {
      return NextResponse.redirect(new URL(`/offer/${autographId}?error=stripe`, request.url));
    }

    return NextResponse.redirect(session.url);
  } catch {
    return NextResponse.redirect(new URL(`/offer/${autographId}?error=stripe`, request.url));
  }
}

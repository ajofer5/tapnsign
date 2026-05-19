import { NextRequest, NextResponse } from 'next/server';
import { usersAreBlocked } from '../../../../../lib/blocks';
import { createStripeCheckoutSession } from '../../../../../lib/stripe';
import { createWebsiteAdminSupabaseClient } from '../../../../../lib/supabase';
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
  const { id: creatorId } = await params;
  const user = await getWebSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/profile/${creatorId}`)}`, request.url));
  }

  if (user.id === creatorId) {
    return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=self`, request.url));
  }

  const formData = await request.formData();
  const recipientName = typeof formData.get('recipient_name') === 'string' ? String(formData.get('recipient_name')).trim() : '';
  const inscriptionText = typeof formData.get('inscription_text') === 'string' ? String(formData.get('inscription_text')).trim() : '';
  const requesterNote = typeof formData.get('requester_note') === 'string' ? String(formData.get('requester_note')).trim() : '';
  const amountCents = parseOfferCents(formData.get('amount'));

  if (!recipientName) {
    return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=recipient`, request.url));
  }
  if (!amountCents) {
    return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=amount`, request.url));
  }

  const supabase = createWebsiteAdminSupabaseClient();
  const { data: creatorProfile } = await supabase
    .from('profiles')
    .select('id, display_name, verified, suspended_at, personalized_requests_enabled, personalized_min_price_cents')
    .eq('id', creatorId)
    .maybeSingle();

  if (!creatorProfile) {
    return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=creator`, request.url));
  }
  if (creatorProfile.suspended_at || !creatorProfile.verified || !creatorProfile.personalized_requests_enabled) {
    return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=creator`, request.url));
  }
  if (await usersAreBlocked(user.id, creatorId)) {
    return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=blocked`, request.url));
  }
  if (creatorProfile.personalized_min_price_cents && amountCents < creatorProfile.personalized_min_price_cents) {
    return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=min_price`, request.url));
  }

  const idempotencyKey = `web-personalized-request:${user.id}:${creatorId}:${amountCents}:${recipientName.toLowerCase()}`;
  let paymentEventId: string | null = null;

  const { data: existingEvent } = await supabase
    .from('payment_events')
    .select('id, amount_cents, provider_metadata, stripe_payment_intent_id, status')
    .eq('user_id', user.id)
    .eq('purpose', 'personalized_request_authorization')
    .eq('idempotency_key', idempotencyKey)
    .in('status', ['created', 'requires_action', 'authorized'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    existingEvent &&
    existingEvent.amount_cents === amountCents &&
    existingEvent.provider_metadata?.creator_id === creatorId &&
    existingEvent.provider_metadata?.recipient_name === recipientName
  ) {
    paymentEventId = existingEvent.id;

    if (existingEvent.status === 'authorized') {
      return NextResponse.redirect(
        new URL(
          `/profile/${creatorId}/personalized-request/success?payment_event_id=${encodeURIComponent(existingEvent.id)}`,
          request.url,
        ),
      );
    }
  }

  if (!paymentEventId) {
    const { data: inserted, error: insertError } = await supabase
      .from('payment_events')
      .insert({
        provider: 'stripe',
        purpose: 'personalized_request_authorization',
        status: 'created',
        user_id: user.id,
        autograph_id: null,
        amount_cents: amountCents,
        currency: 'usd',
        idempotency_key: idempotencyKey,
        provider_metadata: {
          creator_id: creatorId,
          recipient_name: recipientName,
          inscription_text: inscriptionText || null,
          requester_note: requesterNote || null,
          created_via: 'website_personalized_request_checkout',
        },
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=payment`, request.url));
    }

    paymentEventId = inserted.id;
  }

  const ensuredPaymentEventId = paymentEventId;
  if (!ensuredPaymentEventId) {
    return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=payment`, request.url));
  }

  const baseUrl = getWebsiteBaseUrl(request);
  const successUrl = `${baseUrl}/profile/${creatorId}/personalized-request/success?session_id={CHECKOUT_SESSION_ID}&payment_event_id=${ensuredPaymentEventId}`;
  const cancelUrl = `${baseUrl}/profile/${creatorId}?request_canceled=1`;

  try {
    const session = await createStripeCheckoutSession({
      autographId: creatorId,
      certificateId: `personalized-${creatorId}`,
      creatorName: creatorProfile.display_name ?? 'Ophinia Creator',
      amountCents,
      successUrl,
      cancelUrl,
      paymentEventId: ensuredPaymentEventId,
      buyerId: user.id,
      sellerId: creatorId,
      purpose: 'personalized_request_authorization',
      description: `Personalized autograph request for ${recipientName}`,
      captureMethod: 'manual',
      extraMetadata: {
        creator_id: creatorId,
        recipient_name: recipientName,
      },
    });

    if (!session.url) {
      return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=stripe`, request.url));
    }

    return NextResponse.redirect(session.url);
  } catch {
    return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=stripe`, request.url));
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { usersAreBlocked } from '../../../../../../lib/blocks';
import { getAcceptedOffer } from '../../../../../../lib/offers';
import { createStripeCheckoutSession } from '../../../../../../lib/stripe';
import { createWebsiteAdminSupabaseClient } from '../../../../../../lib/supabase';
import { verifyWebSessionToken, WEB_SESSION_COOKIE } from '../../../../../../lib/web-session';

function getWebsiteBaseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
}

function getUserFromRequest(request: NextRequest) {
  const raw = request.cookies.get(WEB_SESSION_COOKIE)?.value;
  return raw ? verifyWebSessionToken(raw)?.user ?? null : null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: offerId } = await params;
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/app/offers/${offerId}/checkout`)}`, request.url));
  }

  const offer = await getAcceptedOffer(offerId);
  if (
    !offer ||
    offer.buyer_id !== user.id ||
    offer.status !== 'accepted' ||
    offer.accepted_transfer_id ||
    (offer.payment_due_at && new Date(offer.payment_due_at).getTime() <= Date.now())
  ) {
    return NextResponse.redirect(new URL(`/app/offers/${offerId}/checkout?error=offer`, request.url));
  }

  if (await usersAreBlocked(user.id, offer.owner_id)) {
    return NextResponse.redirect(new URL(`/app/offers/${offerId}/checkout?error=blocked`, request.url));
  }

  const supabase = createWebsiteAdminSupabaseClient();
  let paymentEventId = offer.payment_event_id;
  const idempotencyKey = `web-offer-checkout:${user.id}:${offer.id}`;

  if (!paymentEventId) {
    const { data: existingEvent } = await supabase
      .from('payment_events')
      .select('id, amount_cents, provider_metadata')
      .eq('user_id', user.id)
      .eq('autograph_id', offer.autograph_id)
      .eq('purpose', 'accepted_offer_purchase')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['created', 'requires_action', 'authorized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingEvent && existingEvent.amount_cents === offer.amount_cents && existingEvent.provider_metadata?.offer_id === offer.id) {
      paymentEventId = existingEvent.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('payment_events')
        .insert({
          provider: 'stripe',
          purpose: 'accepted_offer_purchase',
          status: 'created',
          user_id: user.id,
          autograph_id: offer.autograph_id,
          amount_cents: offer.amount_cents,
          currency: 'usd',
          idempotency_key: idempotencyKey,
          provider_metadata: {
            seller_id: offer.owner_id,
            offer_id: offer.id,
            created_via: 'website_offer_checkout',
          },
        })
        .select('id')
        .single();

      if (insertError || !inserted) {
        return NextResponse.redirect(new URL(`/app/offers/${offerId}/checkout?error=payment`, request.url));
      }

      paymentEventId = inserted.id;
      await supabase
        .from('autograph_offers')
        .update({ payment_event_id: paymentEventId })
        .eq('id', offer.id);
    }
  }

  if (!paymentEventId) {
    return NextResponse.redirect(new URL(`/app/offers/${offerId}/checkout?error=payment`, request.url));
  }

  const baseUrl = getWebsiteBaseUrl(request);
  const successUrl = `${baseUrl}/app/offers/${offer.id}/checkout/success?session_id={CHECKOUT_SESSION_ID}&payment_event_id=${paymentEventId}`;
  const cancelUrl = `${baseUrl}/app/offers/${offer.id}/checkout?canceled=1`;

  try {
    const session = await createStripeCheckoutSession({
      autographId: offer.autograph_id,
      certificateId: offer.autograph.certificate_id,
      creatorName: offer.autograph.creator_name,
      amountCents: offer.amount_cents,
      successUrl,
      cancelUrl,
      paymentEventId,
      buyerId: user.id,
      sellerId: offer.owner_id,
    });

    if (!session.url) {
      return NextResponse.redirect(new URL(`/app/offers/${offer.id}/checkout?error=stripe`, request.url));
    }

    return NextResponse.redirect(session.url);
  } catch {
    return NextResponse.redirect(new URL(`/app/offers/${offer.id}/checkout?error=stripe`, request.url));
  }
}

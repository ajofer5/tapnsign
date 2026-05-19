import { NextRequest, NextResponse } from 'next/server';
import { usersAreBlocked } from '../../../../../../lib/blocks';
import { getPersonalizedRequest } from '../../../../../../lib/personalized-requests';
import { createStripeCheckoutSession } from '../../../../../../lib/stripe';
import { createWebsiteAdminSupabaseClient } from '../../../../../../lib/supabase';
import { getWebSessionUser } from '../../../../../../lib/web-auth';

function getWebsiteBaseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: requestId } = await params;
  const user = await getWebSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/personalized-requests/${requestId}/checkout`)}`, request.url));
  }

  const personalizedRequest = await getPersonalizedRequest(requestId);
  if (
    !personalizedRequest ||
    personalizedRequest.requester_id !== user.id ||
    personalizedRequest.status !== 'fulfilled' ||
    personalizedRequest.completed_transfer_id ||
    !personalizedRequest.autograph ||
    (personalizedRequest.payment_due_at && new Date(personalizedRequest.payment_due_at).getTime() <= Date.now())
  ) {
    return NextResponse.redirect(new URL(`/personalized-requests/${requestId}/checkout?error=request`, request.url));
  }

  if (await usersAreBlocked(user.id, personalizedRequest.creator_id)) {
    return NextResponse.redirect(new URL(`/personalized-requests/${requestId}/checkout?error=blocked`, request.url));
  }

  const supabase = createWebsiteAdminSupabaseClient();
  let paymentEventId = personalizedRequest.payment_event_id;
  const idempotencyKey = `web-personalized-checkout:${user.id}:${personalizedRequest.id}`;

  if (paymentEventId) {
    const { data: existingRequestEvent } = await supabase
      .from('payment_events')
      .select('id, purpose, amount_cents, provider_metadata, status')
      .eq('id', paymentEventId)
      .maybeSingle();

    const isReusablePurchaseEvent =
      !!existingRequestEvent &&
      existingRequestEvent.purpose === 'personalized_request_purchase' &&
      existingRequestEvent.amount_cents === personalizedRequest.amount_cents &&
      existingRequestEvent.provider_metadata?.personalized_request_id === personalizedRequest.id &&
      ['created', 'requires_action', 'authorized'].includes(existingRequestEvent.status);

    if (!isReusablePurchaseEvent) {
      paymentEventId = null;
    }
  }

  if (!paymentEventId) {
    const { data: existingEvent } = await supabase
      .from('payment_events')
      .select('id, amount_cents, provider_metadata')
      .eq('user_id', user.id)
      .eq('autograph_id', personalizedRequest.autograph.id)
      .eq('purpose', 'personalized_request_purchase')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['created', 'requires_action', 'authorized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      existingEvent &&
      existingEvent.amount_cents === personalizedRequest.amount_cents &&
      existingEvent.provider_metadata?.personalized_request_id === personalizedRequest.id
    ) {
      paymentEventId = existingEvent.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('payment_events')
        .insert({
          provider: 'stripe',
          purpose: 'personalized_request_purchase',
          status: 'created',
          user_id: user.id,
          autograph_id: personalizedRequest.autograph.id,
          amount_cents: personalizedRequest.amount_cents,
          currency: 'usd',
          idempotency_key: idempotencyKey,
          provider_metadata: {
            seller_id: personalizedRequest.creator_id,
            personalized_request_id: personalizedRequest.id,
            created_via: 'website_personalized_checkout',
          },
        })
        .select('id')
        .single();

      if (insertError || !inserted) {
        return NextResponse.redirect(new URL(`/personalized-requests/${requestId}/checkout?error=payment`, request.url));
      }

      paymentEventId = inserted.id;
    }

    await supabase
      .from('personalized_autograph_requests')
      .update({ payment_event_id: paymentEventId })
      .eq('id', personalizedRequest.id);
  }

  if (!paymentEventId) {
    return NextResponse.redirect(new URL(`/personalized-requests/${requestId}/checkout?error=payment`, request.url));
  }

  const baseUrl = getWebsiteBaseUrl(request);
  const successUrl = `${baseUrl}/personalized-requests/${personalizedRequest.id}/checkout/success?session_id={CHECKOUT_SESSION_ID}&payment_event_id=${paymentEventId}`;
  const cancelUrl = `${baseUrl}/personalized-requests/${personalizedRequest.id}/checkout?canceled=1`;

  try {
    const session = await createStripeCheckoutSession({
      autographId: personalizedRequest.autograph.id,
      certificateId: personalizedRequest.autograph.certificate_id,
      creatorName: personalizedRequest.autograph.creator_name,
      amountCents: personalizedRequest.amount_cents,
      successUrl,
      cancelUrl,
      paymentEventId,
      buyerId: user.id,
      sellerId: personalizedRequest.creator_id,
      purpose: 'personalized_request_purchase',
      description: `Personalized autograph for ${personalizedRequest.recipient_name}`,
      extraMetadata: {
        personalized_request_id: personalizedRequest.id,
      },
    });

    if (!session.url) {
      return NextResponse.redirect(new URL(`/personalized-requests/${personalizedRequest.id}/checkout?error=stripe`, request.url));
    }

    return NextResponse.redirect(session.url);
  } catch {
    return NextResponse.redirect(new URL(`/personalized-requests/${personalizedRequest.id}/checkout?error=stripe`, request.url));
  }
}

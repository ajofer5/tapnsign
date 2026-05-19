import { NextRequest, NextResponse } from 'next/server';
import { retrieveStripeCheckoutSession, retrieveStripePaymentIntent } from '../../../../../lib/stripe';
import {
  createWebsiteAdminSupabaseClient,
  createWebsiteServerSupabaseClient,
} from '../../../../../lib/supabase';
import { getWebSessionUser } from '../../../../../lib/web-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: creatorId } = await params;
  const user = await getWebSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const sessionId = request.nextUrl.searchParams.get('session_id');
  const paymentEventId = request.nextUrl.searchParams.get('payment_event_id');
  if (!paymentEventId) {
    return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=missing`, request.url));
  }

  try {
    const supabase = createWebsiteAdminSupabaseClient();

    if (sessionId) {
      const stripeSession = await retrieveStripeCheckoutSession(sessionId);
      if (!stripeSession.payment_intent) {
        return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=unpaid`, request.url));
      }

      const paymentIntent = await retrieveStripePaymentIntent(stripeSession.payment_intent);
      if (!['requires_capture', 'processing', 'succeeded'].includes(paymentIntent.status)) {
        return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=unpaid`, request.url));
      }

      // Scope the update to this user's row so a foreign payment_event_id is a no-op.
      await supabase
        .from('payment_events')
        .update({
          stripe_payment_intent_id: paymentIntent.id,
          status: paymentIntent.status === 'requires_capture' ? 'authorized' : 'captured',
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentEventId)
        .eq('user_id', user.id);
    }

    // Verify the payment event belongs to this user before using it.
    const { data: paymentEvent } = await supabase
      .from('payment_events')
      .select('amount_cents, provider_metadata')
      .eq('id', paymentEventId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!paymentEvent) {
      return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=payment`, request.url));
    }

    const serverSupabase = await createWebsiteServerSupabaseClient();
    const {
      data: { session },
    } = await serverSupabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=session`, request.url));
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-personalized-autograph-request`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          creator_id: creatorId,
          recipient_name: paymentEvent.provider_metadata?.recipient_name,
          inscription_text: paymentEvent.provider_metadata?.inscription_text ?? null,
          requester_note: paymentEvent.provider_metadata?.requester_note ?? null,
          amount_cents: paymentEvent.amount_cents,
          payment_event_id: paymentEventId,
        }),
      },
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.redirect(
        new URL(`/profile/${creatorId}?request_error=${encodeURIComponent(data?.error ?? 'request')}`, request.url),
      );
    }

    return NextResponse.redirect(new URL(`/profile/${creatorId}?request_status=sent`, request.url));
  } catch {
    return NextResponse.redirect(new URL(`/profile/${creatorId}?request_error=stripe`, request.url));
  }
}

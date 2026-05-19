import { NextRequest, NextResponse } from 'next/server';
import { retrieveStripeCheckoutSession, retrieveStripePaymentIntent } from '../../../../../lib/stripe';
import {
  createWebsiteAdminSupabaseClient,
  createWebsiteServerSupabaseClient,
} from '../../../../../lib/supabase';
import { getWebSessionUser } from '../../../../../lib/web-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getWebSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const { id: autographId } = await params;
  const sessionId = request.nextUrl.searchParams.get('session_id');
  const paymentEventId = request.nextUrl.searchParams.get('payment_event_id');

  if (!paymentEventId) {
    return NextResponse.redirect(new URL(`/offer/${autographId}?error=missing`, request.url));
  }

  try {
    let paymentIntentId: string | null = null;

    if (sessionId) {
      const stripeSession = await retrieveStripeCheckoutSession(sessionId);
      if (!stripeSession.payment_intent) {
        return NextResponse.redirect(new URL(`/offer/${autographId}?error=unpaid`, request.url));
      }
      paymentIntentId = stripeSession.payment_intent;
    }

    // Always use the admin client scoped to this user — prevents one user from
    // touching another user's payment event.
    const supabase = createWebsiteAdminSupabaseClient();

    if (paymentIntentId) {
      const paymentIntent = await retrieveStripePaymentIntent(paymentIntentId);
      if (!['requires_capture', 'processing', 'succeeded'].includes(paymentIntent.status)) {
        return NextResponse.redirect(new URL(`/offer/${autographId}?error=unpaid`, request.url));
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

    // Read amount_cents from the DB, not from the URL — prevents amount manipulation.
    const { data: paymentEvent } = await supabase
      .from('payment_events')
      .select('amount_cents')
      .eq('id', paymentEventId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!paymentEvent || paymentEvent.amount_cents <= 0) {
      return NextResponse.redirect(new URL(`/offer/${autographId}?error=payment`, request.url));
    }

    const serverSupabase = await createWebsiteServerSupabaseClient();
    const {
      data: { session },
    } = await serverSupabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      return NextResponse.redirect(new URL(`/offer/${autographId}?error=session`, request.url));
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-autograph-offer`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          autograph_id: autographId,
          amount_cents: paymentEvent.amount_cents,
          payment_event_id: paymentEventId,
        }),
      },
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.redirect(new URL(`/offer/${autographId}?error=${encodeURIComponent(data?.error ?? 'offer')}`, request.url));
    }

    if (data?.auto_captured) {
      return NextResponse.redirect(new URL(`/offer/${autographId}?status=completed`, request.url));
    }
    if (data?.auto_accepted) {
      return NextResponse.redirect(new URL(`/offer/${autographId}?status=accepted`, request.url));
    }
    if (data?.auto_decline_scheduled) {
      return NextResponse.redirect(new URL(`/offer/${autographId}?status=auto-decline`, request.url));
    }

    return NextResponse.redirect(new URL(`/offer/${autographId}?status=committed`, request.url));
  } catch {
    return NextResponse.redirect(new URL(`/offer/${autographId}?error=stripe`, request.url));
  }
}

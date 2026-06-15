import { NextRequest, NextResponse } from 'next/server';
import { getPersonalizedRequest } from '../../../../../../lib/personalized-requests';
import { retrieveStripeCheckoutSession } from '../../../../../../lib/stripe';
import { createWebsiteAdminSupabaseClient } from '../../../../../../lib/supabase';
import { getWebSessionUser } from '../../../../../../lib/web-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getWebSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const { id: requestId } = await params;
  const sessionId = request.nextUrl.searchParams.get('session_id');
  const paymentEventId = request.nextUrl.searchParams.get('payment_event_id');
  if (!sessionId || !paymentEventId) {
    return NextResponse.redirect(new URL(`/personalized-requests/${requestId}/checkout?error=missing`, request.url));
  }

  try {
    const stripeSession = await retrieveStripeCheckoutSession(sessionId);
    if (stripeSession.payment_status !== 'paid' || !stripeSession.payment_intent) {
      return NextResponse.redirect(new URL(`/personalized-requests/${requestId}/checkout?error=unpaid`, request.url));
    }

    const supabase = createWebsiteAdminSupabaseClient();
    const personalizedRequest = await getPersonalizedRequest(requestId);
    if (!personalizedRequest || personalizedRequest.requester_id !== user.id) {
      return NextResponse.redirect(new URL(`/personalized-requests/${requestId}/checkout?error=request`, request.url));
    }

    await supabase
      .from('payment_events')
      .update({
        stripe_payment_intent_id: stripeSession.payment_intent,
        status: 'captured',
        captured_at: new Date().toISOString(),
      })
      .eq('id', paymentEventId);

    const completedAt = new Date().toISOString();
    const { data: completedRequest, error } = await supabase
      .from('personalized_autograph_requests')
      .update({
        status: 'completed',
        completed_at: completedAt,
        payment_event_id: paymentEventId,
        updated_at: completedAt,
      })
      .eq('id', requestId)
      .eq('requester_id', user.id)
      .eq('status', 'fulfilled')
      .select('id')
      .maybeSingle();

    if (error || !completedRequest) {
      return NextResponse.redirect(new URL(`/personalized-requests/${requestId}/checkout?error=finalize`, request.url));
    }

    if (personalizedRequest.buyer_commitment_id) {
      await supabase
        .from('buyer_commitments')
        .update({
          status: 'charged',
          charged_at: completedAt,
          updated_at: completedAt,
        })
        .eq('id', personalizedRequest.buyer_commitment_id)
        .eq('status', 'committed');
    }

    return NextResponse.redirect(new URL(`/personalized-requests/${requestId}/checkout?status=success`, request.url));
  } catch {
    return NextResponse.redirect(new URL(`/personalized-requests/${requestId}/checkout?error=stripe`, request.url));
  }
}

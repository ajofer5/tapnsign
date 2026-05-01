import { NextRequest, NextResponse } from 'next/server';
import { retrieveStripeCheckoutSession } from '../../../../../../lib/stripe';
import { createWebsiteAdminSupabaseClient } from '../../../../../../lib/supabase';
import { getWebSessionUser } from '../../../../../../lib/web-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getWebSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const { id: offerId } = await params;
  const sessionId = request.nextUrl.searchParams.get('session_id');
  const paymentEventId = request.nextUrl.searchParams.get('payment_event_id');
  if (!sessionId || !paymentEventId) {
    return NextResponse.redirect(new URL(`/app/offers/${offerId}/checkout?error=missing`, request.url));
  }

  try {
    const stripeSession = await retrieveStripeCheckoutSession(sessionId);
    if (stripeSession.payment_status !== 'paid' || !stripeSession.payment_intent) {
      return NextResponse.redirect(new URL(`/app/offers/${offerId}/checkout?error=unpaid`, request.url));
    }

    const supabase = createWebsiteAdminSupabaseClient();
    const { data: offer } = await supabase
      .from('autograph_offers')
      .select('id, buyer_id, autograph_id')
      .eq('id', offerId)
      .maybeSingle();

    if (!offer || offer.buyer_id !== user.id) {
      return NextResponse.redirect(new URL(`/app/offers/${offerId}/checkout?error=offer`, request.url));
    }

    await supabase
      .from('payment_events')
      .update({
        stripe_payment_intent_id: stripeSession.payment_intent,
        status: 'captured',
        captured_at: new Date().toISOString(),
      })
      .eq('id', paymentEventId);

    const { data: result, error } = await supabase
      .rpc('rpc_finalize_offer_purchase', {
        p_offer_id: offerId,
        p_payment_event_id: paymentEventId,
        p_buyer_id: user.id,
      });

    if (error || !result) {
      return NextResponse.redirect(new URL(`/app/offers/${offerId}/checkout?error=finalize`, request.url));
    }

    return NextResponse.redirect(new URL(`/app/offers/${offerId}/checkout?status=success`, request.url));
  } catch {
    return NextResponse.redirect(new URL(`/app/offers/${offerId}/checkout?error=stripe`, request.url));
  }
}

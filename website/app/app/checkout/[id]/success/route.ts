import { NextRequest, NextResponse } from 'next/server';
import { retrieveStripeCheckoutSession } from '../../../../../lib/stripe';
import { createWebsiteAdminSupabaseClient } from '../../../../../lib/supabase';
import { verifyWebSessionToken, WEB_SESSION_COOKIE } from '../../../../../lib/web-session';

function getUserFromRequest(request: NextRequest) {
  const raw = request.cookies.get(WEB_SESSION_COOKIE)?.value;
  return raw ? verifyWebSessionToken(raw)?.user ?? null : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const { id } = await params;
  const sessionId = request.nextUrl.searchParams.get('session_id');
  const paymentEventId = request.nextUrl.searchParams.get('payment_event_id');
  if (!sessionId || !paymentEventId) {
    return NextResponse.redirect(new URL(`/app/checkout/${id}?error=missing`, request.url));
  }

  try {
    const stripeSession = await retrieveStripeCheckoutSession(sessionId);
    if (stripeSession.payment_status !== 'paid' || !stripeSession.payment_intent) {
      return NextResponse.redirect(new URL(`/app/checkout/${id}?error=unpaid`, request.url));
    }

    const supabase = createWebsiteAdminSupabaseClient();
    const { data: paymentEvent } = await supabase
      .from('payment_events')
      .select('id, user_id, autograph_id, amount_cents')
      .eq('id', paymentEventId)
      .maybeSingle();

    if (!paymentEvent || paymentEvent.user_id !== user.id || paymentEvent.autograph_id !== id) {
      return NextResponse.redirect(new URL(`/app/checkout/${id}?error=payment`, request.url));
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
      .rpc('rpc_finalize_purchase', {
        p_payment_event_id: paymentEventId,
        p_buyer_id: user.id,
      });

    if (error || !result) {
      return NextResponse.redirect(new URL(`/app/checkout/${id}?error=finalize`, request.url));
    }

    return NextResponse.redirect(new URL(`/app/checkout/${id}?status=success`, request.url));
  } catch {
    return NextResponse.redirect(new URL(`/app/checkout/${id}?error=stripe`, request.url));
  }
}

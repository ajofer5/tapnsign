import { NextRequest, NextResponse } from 'next/server';
import { createStripeIdentitySession, retrieveStripeCheckoutSession } from '../../../../lib/stripe';
import { createWebsiteAdminSupabaseClient } from '../../../../lib/supabase';
import { verifyWebSessionToken, WEB_SESSION_COOKIE } from '../../../../lib/web-session';

function getUserFromRequest(request: NextRequest) {
  const raw = request.cookies.get(WEB_SESSION_COOKIE)?.value;
  return raw ? verifyWebSessionToken(raw)?.user ?? null : null;
}

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const sessionId = request.nextUrl.searchParams.get('session_id');
  const paymentEventId = request.nextUrl.searchParams.get('payment_event_id');

  if (!sessionId || !paymentEventId) {
    return NextResponse.redirect(new URL('/app/verify?error=missing', request.url));
  }

  try {
    const stripeSession = await retrieveStripeCheckoutSession(sessionId);

    const isPaid =
      stripeSession.payment_status === 'paid' ||
      stripeSession.payment_status === 'no_payment_required';

    if (!isPaid) {
      return NextResponse.redirect(new URL('/app/verify?error=unpaid', request.url));
    }

    const supabase = createWebsiteAdminSupabaseClient();
    const now = new Date().toISOString();

    // Fetch the payment event to determine access type
    const { data: paymentEvent } = await supabase
      .from('payment_events')
      .select('id, status, verification_attempt_consumed_at, courtesy_retry_granted_at, courtesy_retry_consumed_at')
      .eq('id', paymentEventId)
      .eq('user_id', user.id)
      .eq('purpose', 'verification_fee')
      .maybeSingle();

    if (!paymentEvent) {
      return NextResponse.redirect(new URL('/app/verify?error=payment', request.url));
    }

    // Mark payment event captured
    if (paymentEvent.status !== 'captured') {
      await supabase
        .from('payment_events')
        .update({
          stripe_payment_intent_id: stripeSession.payment_intent ?? null,
          status: 'captured',
          captured_at: now,
        })
        .eq('id', paymentEventId);
    }

    const verificationAccess: 'paid_attempt' | 'courtesy_retry' =
      paymentEvent.courtesy_retry_granted_at && !paymentEvent.courtesy_retry_consumed_at
        ? 'courtesy_retry'
        : 'paid_attempt';

    // Create Stripe Identity session directly (server-to-server, no bearer token needed)
    const identitySession = await createStripeIdentitySession({
      userId: user.id,
      paymentEventId,
      verificationAccess,
    });

    // Record the identity session on the payment event
    const verificationUpdate: Record<string, string> = {
      verification_attempt_consumed_at: paymentEvent.verification_attempt_consumed_at ?? now,
      verification_attempt_session_id: identitySession.id,
      verification_attempt_result: 'pending',
    };
    if (verificationAccess === 'courtesy_retry') {
      verificationUpdate.courtesy_retry_consumed_at = now;
    }
    await supabase.from('payment_events').update(verificationUpdate).eq('id', paymentEventId);

    // Update profile to pending
    await supabase
      .from('profiles')
      .update({ verification_status: 'pending', verification_updated_at: now })
      .eq('id', user.id);

    // Insert verification event
    await supabase.from('verification_events').insert({
      user_id: user.id,
      event_type: 'identity_session_created',
      status: 'pending',
      stripe_verification_session_id: identitySession.id,
      provider_payload: {
        url: identitySession.url,
        payment_event_id: paymentEventId,
        verification_access: verificationAccess,
      },
      processed_at: now,
    });

    // Redirect to Stripe Identity
    if (identitySession.url) {
      return NextResponse.redirect(identitySession.url);
    }

    // Identity session created but no URL (shouldn't happen) — still show success
    return NextResponse.redirect(new URL('/app/verify?status=success', request.url));
  } catch {
    return NextResponse.redirect(new URL('/app/verify?error=stripe', request.url));
  }
}

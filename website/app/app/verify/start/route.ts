import { NextRequest, NextResponse } from 'next/server';
import { createVerificationCheckoutSession } from '../../../../lib/stripe';
import { createWebsiteAdminSupabaseClient } from '../../../../lib/supabase';
import { verifyWebSessionToken, WEB_SESSION_COOKIE } from '../../../../lib/web-session';

const VERIFICATION_FEE_CENTS = 499;

function getWebsiteBaseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
}

function getUserFromRequest(request: NextRequest) {
  const raw = request.cookies.get(WEB_SESSION_COOKIE)?.value;
  return raw ? verifyWebSessionToken(raw)?.user ?? null : null;
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const supabase = createWebsiteAdminSupabaseClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, verification_status, suspended_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.suspended_at) {
    return NextResponse.redirect(new URL('/app/verify?error=suspended', request.url));
  }

  if (profile?.role === 'verified' && profile?.verification_status === 'verified') {
    return NextResponse.redirect(new URL('/app/verify?error=already_verified', request.url));
  }

  const baseUrl = getWebsiteBaseUrl(request);
  const successUrl = `${baseUrl}/app/verify/success?session_id={CHECKOUT_SESSION_ID}&payment_event_id={PAYMENT_EVENT_ID}`;
  const cancelUrl = `${baseUrl}/app/verify?canceled=1`;

  // Check for a courtesy retry — reuse existing payment event
  const { data: courtesyEvent } = await supabase
    .from('payment_events')
    .select('id')
    .eq('user_id', user.id)
    .eq('purpose', 'verification_fee')
    .not('courtesy_retry_granted_at', 'is', null)
    .is('courtesy_retry_consumed_at', null)
    .limit(1)
    .maybeSingle();

  let paymentEventId: string;

  if (courtesyEvent) {
    paymentEventId = courtesyEvent.id;
  } else {
    // Check for an existing uncaptured payment event (idempotency)
    const idempotencyKey = `web-verification:${user.id}`;
    const { data: existingEvent } = await supabase
      .from('payment_events')
      .select('id')
      .eq('user_id', user.id)
      .eq('purpose', 'verification_fee')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['created', 'requires_action', 'authorized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingEvent) {
      paymentEventId = existingEvent.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('payment_events')
        .insert({
          provider: 'stripe',
          purpose: 'verification_fee',
          status: 'created',
          user_id: user.id,
          amount_cents: VERIFICATION_FEE_CENTS,
          currency: 'usd',
          idempotency_key: idempotencyKey,
          provider_metadata: { created_via: 'website_checkout' },
        })
        .select('id')
        .single();

      if (insertError || !inserted) {
        return NextResponse.redirect(new URL('/app/verify?error=payment', request.url));
      }
      paymentEventId = inserted.id;
    }
  }

  try {
    const session = await createVerificationCheckoutSession({
      userId: user.id,
      paymentEventId,
      successUrl: successUrl.replace('{PAYMENT_EVENT_ID}', paymentEventId),
      cancelUrl,
    });

    if (!session.url) {
      return NextResponse.redirect(new URL('/app/verify?error=stripe', request.url));
    }

    return NextResponse.redirect(session.url);
  } catch {
    return NextResponse.redirect(new URL('/app/verify?error=stripe', request.url));
  }
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders, json } from '../_shared/utils.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function recordVerificationEvent(params: {
  userId: string;
  eventType: 'identity_verified' | 'identity_failed' | 'identity_requires_input' | 'identity_expired';
  status: 'verified' | 'failed' | 'expired';
  sessionId: string;
  payload: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin
    .from('verification_events')
    .insert({
      user_id: params.userId,
      event_type: params.eventType,
      status: params.status,
      stripe_verification_session_id: params.sessionId,
      provider_payload: params.payload,
      processed_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(error.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_IDENTITY_WEBHOOK_SECRET');

  if (!signature || !webhookSecret) {
    return json({ error: 'Missing stripe signature or webhook secret' }, 400);
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    return json({ error: `Webhook signature verification failed: ${err.message}` }, 400);
  }

  try {
    const session = event.data.object as Stripe.Identity.VerificationSession;
    const userId = session.metadata?.supabase_user_id;
    if (!userId) {
      return json({ received: true, ignored: 'missing user metadata' });
    }

    const now = new Date().toISOString();

    if (event.type === 'identity.verification_session.verified') {
      await supabaseAdmin
        .from('profiles')
        .update({
          role: 'verified',
          verification_status: 'verified',
          verification_updated_at: now,
        })
        .eq('id', userId);

      await recordVerificationEvent({
        userId,
        eventType: 'identity_verified',
        status: 'verified',
        sessionId: session.id,
        payload: {
          last_error: session.last_error ?? null,
          metadata: session.metadata ?? {},
        },
      });
    }

    if (event.type === 'identity.verification_session.requires_input') {
      await supabaseAdmin
        .from('profiles')
        .update({
          verification_status: 'failed',
          verification_updated_at: now,
        })
        .eq('id', userId);

      await recordVerificationEvent({
        userId,
        eventType: 'identity_requires_input',
        status: 'failed',
        sessionId: session.id,
        payload: {
          last_error: session.last_error ?? null,
          metadata: session.metadata ?? {},
        },
      });
    }

    if (event.type === 'identity.verification_session.canceled') {
      await supabaseAdmin
        .from('profiles')
        .update({
          verification_status: 'expired',
          verification_updated_at: now,
        })
        .eq('id', userId);

      await recordVerificationEvent({
        userId,
        eventType: 'identity_expired',
        status: 'expired',
        sessionId: session.id,
        payload: {
          metadata: session.metadata ?? {},
        },
      });
    }

    return json({ received: true });
  } catch (error: any) {
    console.error('stripe-identity-webhook error:', error.message);
    return json({ error: error.message }, 500);
  }
});

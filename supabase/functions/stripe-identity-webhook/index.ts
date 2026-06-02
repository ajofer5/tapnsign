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

async function updateProfileVerificationState(userId: string, payload: Record<string, unknown>) {
  const { error, data } = await supabaseAdmin
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Could not update verification state.');
  }
}

async function updateVerificationAttemptResult(paymentEventId: string | undefined, result: 'verified' | 'failed' | 'expired') {
  if (!paymentEventId) return;

  const { error } = await supabaseAdmin
    .from('payment_events')
    .update({
      verification_attempt_result: result,
    })
    .eq('id', paymentEventId);

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
    const paymentEventId = session.metadata?.payment_event_id;
    if (!userId) {
      return json({ received: true, ignored: 'missing user metadata' });
    }

    const now = new Date().toISOString();

    if (event.type === 'identity.verification_session.verified') {
      const dob = session.verified_outputs?.dob as { day?: number; month?: number; year?: number } | null | undefined;
      const birthdayFields: Record<string, number> = {};
      if (dob?.month) birthdayFields.birthday_month = dob.month;
      if (dob?.day)   birthdayFields.birthday_day   = dob.day;
      if (dob?.year)  birthdayFields.birthday_year  = dob.year;

      // Determine real age from verified ID and set/strip is_creator accordingly
      let isCreator: boolean | undefined;
      if (dob?.year) {
        const today = new Date();
        let age = today.getFullYear() - dob.year;
        if (dob.month && dob.day) {
          const birthThisYear = new Date(today.getFullYear(), dob.month - 1, dob.day);
          if (today < birthThisYear) age--;
        }
        isCreator = age >= 18;
      }

      const nameOutput = session.verified_outputs?.name as { first_name?: string; last_name?: string } | null | undefined;
      const validatedName = [nameOutput?.first_name, nameOutput?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() || null;

      await updateProfileVerificationState(userId, {
          role: 'verified',
          verification_status: 'verified',
          verification_updated_at: now,
          ...(validatedName ? { validated_name: validatedName } : {}),
          ...(isCreator !== undefined ? { is_creator: isCreator } : {}),
          ...birthdayFields,
        });
      await updateVerificationAttemptResult(paymentEventId, 'verified');

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
      await updateProfileVerificationState(userId, {
          verification_status: 'failed',
          verification_updated_at: now,
        });
      await updateVerificationAttemptResult(paymentEventId, 'failed');

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
      await updateProfileVerificationState(userId, {
          verification_status: 'expired',
          verification_updated_at: now,
        });
      await updateVerificationAttemptResult(paymentEventId, 'expired');

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

import { assert, getProfile, handleRequest, json, requireUser, stripe, supabaseAdmin } from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const profile = await getProfile(user.id);

    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(!(profile.role === 'verified' && profile.verification_status === 'verified'), 409, 'User is already verified.');

    const { data: paymentEvent, error: paymentEventError } = await supabaseAdmin
      .from('payment_events')
      .select('id, stripe_payment_intent_id, status')
      .eq('user_id', user.id)
      .eq('purpose', 'verification_fee')
      .in('status', ['created', 'captured'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentEventError || !paymentEvent?.stripe_payment_intent_id) {
      throw new Error(paymentEventError?.message ?? 'No verification payment found.');
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentEvent.stripe_payment_intent_id);
    assert(paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing', 409, 'Verification payment has not completed.');

    if (paymentEvent.status !== 'captured') {
      const { error: paymentUpdateError } = await supabaseAdmin
        .from('payment_events')
        .update({
          status: 'captured',
          captured_at: new Date().toISOString(),
        })
        .eq('id', paymentEvent.id);

      if (paymentUpdateError) {
        throw new Error(paymentUpdateError.message);
      }
    }

    const verificationSession = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: {
        supabase_user_id: user.id,
        payment_event_id: paymentEvent.id,
      },
    });

    const now = new Date().toISOString();

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({
        verification_status: 'pending',
        verification_updated_at: now,
      })
      .eq('id', user.id);

    if (profileUpdateError) {
      throw new Error(profileUpdateError.message);
    }

    const { error: verificationEventError } = await supabaseAdmin
      .from('verification_events')
      .insert({
        user_id: user.id,
        event_type: 'identity_session_created',
        status: 'pending',
        stripe_verification_session_id: verificationSession.id,
        provider_payload: {
          url: verificationSession.url,
          payment_event_id: paymentEvent.id,
        },
        processed_at: now,
      });

    if (verificationEventError) {
      throw new Error(verificationEventError.message);
    }

    return json({
      url: verificationSession.url,
      verification_session_id: verificationSession.id,
      payment_event_id: paymentEvent.id,
    });
  }, req)
);

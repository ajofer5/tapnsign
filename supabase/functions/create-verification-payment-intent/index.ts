import { assert, getIdempotencyKey, getProfile, getRequestId, handleRequest, json, requireUser, stripe, supabaseAdmin } from '../_shared/utils.ts';

const VERIFICATION_FEE_CENTS = 499;

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    let body: Record<string, unknown> = {};
    try {
      body = await request.clone().json();
    } catch {
      body = {};
    }
    const profile = await getProfile(user.id);
    const idempotencyKey = getIdempotencyKey(request, body, `verification:${user.id}`);

    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(!(profile.role === 'verified' && profile.verification_status === 'verified'), 409, 'User is already verified.');

    const { data: existingEvent } = await supabaseAdmin
      .from('payment_events')
      .select('id, stripe_payment_intent_id, amount_cents')
      .eq('user_id', user.id)
      .eq('purpose', 'verification_fee')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['created', 'requires_action', 'authorized', 'captured'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingEvent?.stripe_payment_intent_id) {
      const existingIntent = await stripe.paymentIntents.retrieve(existingEvent.stripe_payment_intent_id);
      return json({
        client_secret: existingIntent.client_secret,
        payment_intent_id: existingIntent.id,
        payment_event_id: existingEvent.id,
        amount_cents: existingEvent.amount_cents,
        reused: true,
      });
    }

    const requestId = getRequestId();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: VERIFICATION_FEE_CENTS,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        request_id: requestId,
        purpose: 'verification_fee',
        user_id: user.id,
      },
    }, {
      idempotencyKey,
    });

    const { data: paymentEvent, error } = await supabaseAdmin
      .from('payment_events')
      .insert({
        provider: 'stripe',
        purpose: 'verification_fee',
        status: 'created',
        user_id: user.id,
        amount_cents: VERIFICATION_FEE_CENTS,
        currency: 'usd',
        idempotency_key: idempotencyKey,
        stripe_payment_intent_id: paymentIntent.id,
        provider_metadata: {
          request_id: requestId,
        },
      })
      .select('id')
      .single();

    if (error || !paymentEvent) {
      const { data: retryEvent } = await supabaseAdmin
        .from('payment_events')
        .select('id, stripe_payment_intent_id, amount_cents')
        .eq('user_id', user.id)
        .eq('purpose', 'verification_fee')
        .eq('idempotency_key', idempotencyKey)
        .in('status', ['created', 'requires_action', 'authorized', 'captured'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (retryEvent?.stripe_payment_intent_id) {
        const retryIntent = await stripe.paymentIntents.retrieve(retryEvent.stripe_payment_intent_id);
        return json({
          client_secret: retryIntent.client_secret,
          payment_intent_id: retryIntent.id,
          payment_event_id: retryEvent.id,
          amount_cents: retryEvent.amount_cents,
          reused: true,
        });
      }

      throw new Error(error?.message ?? 'Could not create payment event.');
    }

    return json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      payment_event_id: paymentEvent.id,
      amount_cents: VERIFICATION_FEE_CENTS,
      reused: false,
    });
  }, req)
);

import { assert, getAutographForUpdate, getIdempotencyKey, getRequestId, getProfile, handleRequest, json, parseJson, requireString, requireUser, stripe, supabaseAdmin } from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const body = await parseJson(request);

    const autographId = requireString(body.autograph_id, 'autograph_id');
    const idempotencyKey = getIdempotencyKey(request, body, `purchase:${user.id}:${autographId}`);
    const autograph = await getAutographForUpdate(autographId);
    const profile = await getProfile(user.id);

    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.is_for_sale, 409, 'Autograph is not listed for sale.');
    assert(autograph.listing_type === 'fixed', 409, 'Autograph is not a fixed-price listing.');
    assert(autograph.owner_id !== user.id, 409, 'You cannot purchase your own autograph.');
    assert(typeof autograph.price_cents === 'number' && autograph.price_cents > 0, 409, 'Listing price is invalid.');

    const { data: existingEvent } = await supabaseAdmin
      .from('payment_events')
      .select('id, stripe_payment_intent_id, amount_cents, provider_metadata')
      .eq('user_id', user.id)
      .eq('autograph_id', autographId)
      .eq('purpose', 'fixed_price_purchase')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['created', 'requires_action', 'authorized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const canReuseExistingEvent =
      !!existingEvent?.stripe_payment_intent_id &&
      existingEvent.amount_cents === autograph.price_cents &&
      existingEvent.provider_metadata?.seller_id === autograph.owner_id;

    if (canReuseExistingEvent) {
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
      amount: autograph.price_cents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        request_id: requestId,
        purpose: 'fixed_price_purchase',
        autograph_id: autographId,
        buyer_id: user.id,
        seller_id: autograph.owner_id,
      },
    }, {
      idempotencyKey,
    });

    const { data: paymentEvent, error } = await supabaseAdmin
      .from('payment_events')
      .insert({
        provider: 'stripe',
        purpose: 'fixed_price_purchase',
        status: 'created',
        user_id: user.id,
        autograph_id: autographId,
        amount_cents: autograph.price_cents,
        currency: 'usd',
        idempotency_key: idempotencyKey,
        stripe_payment_intent_id: paymentIntent.id,
        provider_metadata: {
          request_id: requestId,
          seller_id: autograph.owner_id,
        },
      })
      .select('id')
      .single();

    if (error || !paymentEvent) {
      const { data: retryEvent } = await supabaseAdmin
        .from('payment_events')
        .select('id, stripe_payment_intent_id, amount_cents')
        .eq('user_id', user.id)
        .eq('autograph_id', autographId)
        .eq('purpose', 'fixed_price_purchase')
        .eq('idempotency_key', idempotencyKey)
        .in('status', ['created', 'requires_action', 'authorized'])
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
      amount_cents: autograph.price_cents,
      reused: false,
    });
  }, req)
);

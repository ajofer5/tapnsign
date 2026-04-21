import {
  assert,
  getAutographForUpdate,
  getIdempotencyKey,
  getProfile,
  getRequestId,
  handleRequest,
  HttpError,
  json,
  parseJson,
  requireString,
  requireUser,
  stripe,
  supabaseAdmin,
} from '../_shared/utils.ts';

// $16.99 print — shipping included
const PRINT_BUNDLE_CENTS = 1699;

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const body = await parseJson(request);

    const autographId = requireString(body.autograph_id, 'autograph_id');
    const idempotencyKey = getIdempotencyKey(request, body, `print:${user.id}:${autographId}`);

    const [autograph, profile] = await Promise.all([
      getAutographForUpdate(autographId),
      getProfile(user.id),
    ]);

    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.owner_id === user.id, 403, 'You do not own this autograph.');

    // Block if this owner already has a fulfilled print (not canceled)
    const { data: existingPrint, error: existingPrintError } = await supabaseAdmin
      .from('autograph_prints')
      .select('id, fulfillment_status')
      .eq('autograph_id', autographId)
      .eq('owner_id_at_print', user.id)
      .eq('status', 'created')
      .limit(1)
      .maybeSingle();

    if (existingPrintError) throw new HttpError(500, 'Could not check print history.');

    if (existingPrint) {
      // Allow re-initiating payment only if the prior attempt never confirmed payment
      assert(
        existingPrint.fulfillment_status === 'pending',
        409,
        'You have already ordered a print for this autograph.'
      );
    }

    // Reuse an existing open payment intent for idempotency
    const { data: existingEvent } = await supabaseAdmin
      .from('payment_events')
      .select('id, stripe_payment_intent_id, amount_cents')
      .eq('user_id', user.id)
      .eq('autograph_id', autographId)
      .eq('purpose', 'print_bundle')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['created', 'requires_action', 'authorized'])
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
      amount: PRINT_BUNDLE_CENTS,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        request_id: requestId,
        purpose: 'print_bundle',
        autograph_id: autographId,
        user_id: user.id,
      },
    }, { idempotencyKey });

    const { data: paymentEvent, error } = await supabaseAdmin
      .from('payment_events')
      .insert({
        provider: 'stripe',
        purpose: 'print_bundle',
        status: 'created',
        user_id: user.id,
        autograph_id: autographId,
        amount_cents: PRINT_BUNDLE_CENTS,
        currency: 'usd',
        idempotency_key: idempotencyKey,
        stripe_payment_intent_id: paymentIntent.id,
        provider_metadata: { request_id: requestId },
      })
      .select('id')
      .single();

    if (error || !paymentEvent) {
      // Race condition fallback — another request may have inserted first
      const { data: retryEvent } = await supabaseAdmin
        .from('payment_events')
        .select('id, stripe_payment_intent_id, amount_cents')
        .eq('user_id', user.id)
        .eq('autograph_id', autographId)
        .eq('purpose', 'print_bundle')
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
      amount_cents: PRINT_BUNDLE_CENTS,
      reused: false,
    });
  }, req)
);

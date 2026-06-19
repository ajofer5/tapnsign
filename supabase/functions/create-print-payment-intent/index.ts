import {
  assert,
  assertPaymentIntentRateLimit,
  assertUsersNotBlocked,
  getAutographForUpdate,
  getIdempotencyKey,
  getPlatformFee,
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

const RETAIL_PRINT_CENTS = 1000;
const FLAT_SHIPPING_CENTS = 699;
// Fixed payout to the autograph owner per print sold
const OWNER_PRINT_PAYOUT_CENTS = 250;

// Kill switch — mirrors submit-print-order; blocks payment intent creation when disabled
const PRODIGI_SUBMISSION_ENABLED = Deno.env.get('PRODIGI_SUBMISSION_ENABLED') !== 'false';
// Order caps — checked before any Stripe work so customers never pay for a blocked order.
// Both count orders (not individual prints): one payment_events row = one app order.
const HOURLY_ORDER_CAP = parseInt(Deno.env.get('HOURLY_PRINT_ORDER_CAP') ?? '50', 10);
const DAILY_ORDER_CAP = parseInt(Deno.env.get('DAILY_PRINT_ORDER_CAP') ?? '250', 10);

Deno.serve((req) =>
  handleRequest(async (request) => {
    // Kill switch — bail before any DB or Stripe work
    assert(PRODIGI_SUBMISSION_ENABLED, 503, 'Print orders are temporarily unavailable. Please try again later.');

    const user = await requireUser(request);

    // Hourly + daily caps — checked before creating a Stripe payment intent so customers
    // never pay for an order that would be rejected at fulfillment time.
    // Both caps count orders (not individual prints): one payment_events row = one app order;
    // one web_print_orders row = one web order. This matches the web checkout cap calculation.
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const [
      { count: appHourCount },
      { count: webHourCount },
      { count: appDayCount },
      { count: webDayCount },
    ] = await Promise.all([
      supabaseAdmin
        .from('payment_events')
        .select('id', { count: 'exact', head: true })
        .eq('purpose', 'print_bundle')
        .gte('created_at', oneHourAgo),
      supabaseAdmin
        .from('web_print_orders')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo)
        .in('status', ['pending', 'paid', 'submitted']),
      supabaseAdmin
        .from('payment_events')
        .select('id', { count: 'exact', head: true })
        .eq('purpose', 'print_bundle')
        .gte('created_at', todayStart.toISOString()),
      supabaseAdmin
        .from('web_print_orders')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString())
        .in('status', ['pending', 'paid', 'submitted']),
    ]);
    assert(
      (appHourCount ?? 0) + (webHourCount ?? 0) < HOURLY_ORDER_CAP,
      503,
      'Order volume is unusually high right now. Please try again in a few minutes.'
    );
    assert(
      (appDayCount ?? 0) + (webDayCount ?? 0) < DAILY_ORDER_CAP,
      503,
      'Daily order capacity has been reached. Please try again tomorrow.'
    );
    const body = await parseJson(request);

    const requestedAutographIds = Array.isArray(body.autograph_ids)
      ? body.autograph_ids
      : [body.autograph_id];
    const autographIds = Array.from(new Set(
      requestedAutographIds
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    ));
    assert(autographIds.length >= 1, 400, 'autograph_id required.');
    assert(autographIds.length <= 5, 400, 'You can order up to 5 prints at a time.');
    const autographId = autographIds[0];
    const isBundle = autographIds.length > 1;
    const idempotencyKey = getIdempotencyKey(request, body, crypto.randomUUID());
    const quantity = typeof body.quantity === 'number' && body.quantity >= 1 && body.quantity <= 5
      ? Math.floor(body.quantity)
      : 1;
    const printCount = isBundle ? autographIds.length : quantity;

    await assertPaymentIntentRateLimit(user.id);

    const [profile, autographRows] = await Promise.all([
      getProfile(user.id),
      autographIds.length === 1
        ? getAutographForUpdate(autographId).then((autograph) => [autograph])
        : supabaseAdmin
            .from('autographs')
            .select('id, creator_id, owner_id, status, visibility, prints_enabled, print_limit')
            .in('id', autographIds)
            .then(({ data, error }) => {
              if (error) throw new HttpError(500, error.message);
              return data ?? [];
            }),
    ]);
    assert(autographRows.length === autographIds.length, 404, 'One or more autographs were not found.');
    const autographById = new Map(autographRows.map((autograph: any) => [autograph.id, autograph]));
    const autographs = autographIds.map((id) => autographById.get(id));
    const autograph = autographs[0];
    const ownerId = autograph.owner_id;
    const creatorId = autograph.creator_id;
    const printBundleCents = (RETAIL_PRINT_CENTS * printCount) + FLAT_SHIPPING_CENTS;

    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(profile.is_creator === true, 403, 'You must be 18 or older to purchase prints.');
    for (const candidate of autographs) {
      assert(candidate.creator_id === creatorId, 409, 'All selected prints must be from the same creator.');
      assert(candidate.owner_id === ownerId, 409, 'All selected prints must be from the same creator.');
      assert(candidate.status === 'active', 409, 'Autograph is not active.');
      assert(candidate.visibility === 'public' || candidate.owner_id === user.id, 403, 'This autograph is not available for prints.');
      assert(candidate.owner_id === user.id || candidate.prints_enabled === true, 409, 'Prints are not available for this autograph.');
    }
    const { data: participantProfiles, error: participantError } = await supabaseAdmin
      .from('profiles')
      .select('id, suspended_at')
      .in('id', Array.from(new Set([creatorId, ownerId])));
    if (participantError) throw new HttpError(500, participantError.message);
    const suspendedParticipant = (participantProfiles ?? []).find((participant) => participant.suspended_at);
    assert(!suspendedParticipant, 403, 'Prints are not available for this creator.');

    await assertUsersNotBlocked(user.id, creatorId, 'You cannot purchase a print from this creator.');
    await assertUsersNotBlocked(user.id, ownerId, 'You cannot purchase a print from this owner.');

    for (const candidate of autographs) {
      if (typeof candidate.print_limit !== 'number') continue;
      const { count, error: printCountError } = await supabaseAdmin
        .from('autograph_prints')
        .select('id', { count: 'exact', head: true })
        .eq('autograph_id', candidate.id)
        .eq('status', 'created');

      if (printCountError) throw new HttpError(500, printCountError.message);
      assert((count ?? 0) < candidate.print_limit, 409, 'This autograph has reached its print limit.');
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
      // If already succeeded, mark captured and fall through to create a fresh intent
      if (existingIntent.status === 'succeeded' || existingIntent.status === 'canceled') {
        await supabaseAdmin
          .from('payment_events')
          .update({ status: existingIntent.status === 'succeeded' ? 'captured' : 'canceled' })
          .eq('id', existingEvent.id);
      } else {
        return json({
          client_secret: existingIntent.client_secret,
          payment_intent_id: existingIntent.id,
          payment_event_id: existingEvent.id,
          amount_cents: existingEvent.amount_cents,
          reused: true,
        });
      }
    }

    const requestId = getRequestId();
    const ownerPayoutCents = OWNER_PRINT_PAYOUT_CENTS * printCount;
    const { feeCents } = await getPlatformFee(printBundleCents);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: printBundleCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        request_id: requestId,
        purpose: 'print_bundle',
        autograph_id: autographId,
        autograph_ids: autographIds.join(','),
        user_id: user.id,
        quantity: String(printCount),
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
        amount_cents: printBundleCents,
        currency: 'usd',
        idempotency_key: idempotencyKey,
        stripe_payment_intent_id: paymentIntent.id,
        platform_fee_cents: feeCents,
        provider_metadata: {
          request_id: requestId,
          owner_id: ownerId,
          creator_id: creatorId,
          autograph_ids: autographIds,
          owner_payout_cents: ownerPayoutCents,
          owner_connect_scheduled: false,
          payout_model: 'ledger',
          quantity: printCount,
          bundle: isBundle,
        },
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
      amount_cents: printBundleCents,
      reused: false,
    });
  }, req)
);

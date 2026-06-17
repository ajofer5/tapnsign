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
// Daily order cap — checked here so customers cannot start a payment when the cap is already hit
const DAILY_ORDER_CAP = parseInt(Deno.env.get('DAILY_PRINT_ORDER_CAP') ?? '50', 10);

Deno.serve((req) =>
  handleRequest(async (request) => {
    // Kill switch — bail before any DB or Stripe work
    assert(PRODIGI_SUBMISSION_ENABLED, 503, 'Print orders are temporarily unavailable. Please try again later.');

    const user = await requireUser(request);

    // Daily cap — check before creating a Stripe payment intent so customers
    // never pay for an order that would be rejected at fulfillment time.
    // Cap is defined as total print orders (app + web) created today, where one
    // payment intent = one app order and one web_print_orders row = one web order,
    // regardless of quantity. This matches the web checkout cap calculation.
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const [{ count: appOrderCount }, { count: webOrderCount }] = await Promise.all([
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
      (appOrderCount ?? 0) + (webOrderCount ?? 0) < DAILY_ORDER_CAP,
      503,
      'Daily order capacity has been reached. Please try again tomorrow.'
    );
    const body = await parseJson(request);

    const autographId = requireString(body.autograph_id, 'autograph_id');
    const idempotencyKey = getIdempotencyKey(request, body, crypto.randomUUID());
    const quantity = typeof body.quantity === 'number' && body.quantity >= 1 && body.quantity <= 5
      ? Math.floor(body.quantity)
      : 1;

    await assertPaymentIntentRateLimit(user.id);

    const [autograph, profile] = await Promise.all([
      getAutographForUpdate(autographId),
      getProfile(user.id),
    ]);
    const printBundleCents = (RETAIL_PRINT_CENTS * quantity) + FLAT_SHIPPING_CENTS;

    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(profile.is_creator === true, 403, 'You must be 18 or older to purchase prints.');
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.visibility === 'public' || autograph.owner_id === user.id, 403, 'This autograph is not available for prints.');
    assert(autograph.owner_id === user.id || autograph.prints_enabled === true, 409, 'Prints are not available for this autograph.');
    await assertUsersNotBlocked(user.id, autograph.creator_id, 'You cannot purchase a print from this creator.');
    await assertUsersNotBlocked(user.id, autograph.owner_id, 'You cannot purchase a print from this owner.');

    // Fetch owner's Stripe Connect account for real-time payout split
    const { data: ownerConnectData } = await supabaseAdmin
      .from('profiles')
      .select('stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_onboarding_complete')
      .eq('id', autograph.owner_id)
      .single();
    const ownerConnectAccountId: string | null =
      ownerConnectData?.stripe_connect_onboarding_complete === true &&
      ownerConnectData?.stripe_connect_charges_enabled === true &&
      ownerConnectData?.stripe_connect_payouts_enabled === true
        ? ownerConnectData.stripe_connect_account_id
        : null;

    if (typeof autograph.print_limit === 'number') {
      const { count, error: printCountError } = await supabaseAdmin
        .from('autograph_prints')
        .select('id', { count: 'exact', head: true })
        .eq('autograph_id', autographId)
        .eq('status', 'created');

      if (printCountError) throw new HttpError(500, printCountError.message);
      assert((count ?? 0) < autograph.print_limit, 409, 'This autograph has reached its print limit.');
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
    const ownerPayoutCents = OWNER_PRINT_PAYOUT_CENTS * quantity;
    const { feeCents } = await getPlatformFee(printBundleCents);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: printBundleCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        request_id: requestId,
        purpose: 'print_bundle',
        autograph_id: autographId,
        user_id: user.id,
        quantity: String(quantity),
      },
      ...(ownerConnectAccountId
        ? { transfer_data: { amount: ownerPayoutCents, destination: ownerConnectAccountId } }
        : {}),
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
          owner_id: autograph.owner_id,
          owner_payout_cents: ownerPayoutCents,
          owner_connect_scheduled: ownerConnectAccountId !== null,
          quantity,
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

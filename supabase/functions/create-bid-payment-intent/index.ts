import { requireVerifiedUser } from '../_shared/marketplace.ts';
import { assert, getAutographForUpdate, getIdempotencyKey, getRequestId, handleRequest, json, parseJson, requirePositiveInteger, requireString, requireUser, stripe, supabaseAdmin } from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    await requireVerifiedUser(user.id);

    const body = await parseJson(request);
    const autographId = requireString(body.autograph_id, 'autograph_id');
    const amountCents = requirePositiveInteger(body.amount_cents, 'amount_cents');
    const idempotencyKey = getIdempotencyKey(request, body, `bid:${user.id}:${autographId}:${amountCents}`);

    const autograph = await getAutographForUpdate(autographId);
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.is_for_sale, 409, 'Autograph is not listed for sale.');
    assert(autograph.listing_type === 'auction', 409, 'Autograph is not an auction listing.');
    assert(autograph.owner_id !== user.id, 409, 'You cannot bid on your own autograph.');
    assert(autograph.auction_ends_at && new Date(autograph.auction_ends_at).getTime() > Date.now(), 409, 'Auction has ended.');

    const { data: topBidRow } = await supabaseAdmin
      .from('bids')
      .select('amount_cents')
      .eq('autograph_id', autographId)
      .eq('status', 'active')
      .order('amount_cents', { ascending: false })
      .limit(1)
      .maybeSingle();

    const minBid = topBidRow?.amount_cents
      ? topBidRow.amount_cents + 100
      : (autograph.reserve_price_cents ?? 100);

    assert(amountCents >= minBid, 409, `Minimum bid is ${minBid} cents.`);

    const { data: existingEvent } = await supabaseAdmin
      .from('payment_events')
      .select('id, stripe_payment_intent_id, amount_cents, provider_metadata')
      .eq('user_id', user.id)
      .eq('autograph_id', autographId)
      .eq('purpose', 'auction_bid_authorization')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['created', 'requires_action', 'authorized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const canReuseExistingEvent =
      !!existingEvent?.stripe_payment_intent_id &&
      existingEvent.amount_cents === amountCents &&
      existingEvent.provider_metadata?.seller_id === autograph.owner_id &&
      existingEvent.provider_metadata?.auction_ends_at === autograph.auction_ends_at;

    if (canReuseExistingEvent) {
      const existingIntent = await stripe.paymentIntents.retrieve(existingEvent.stripe_payment_intent_id);
      return json({
        client_secret: existingIntent.client_secret,
        payment_intent_id: existingIntent.id,
        payment_event_id: existingEvent.id,
        amount_cents: existingEvent.amount_cents,
        min_bid_cents: minBid,
        reused: true,
      });
    }

    const requestId = getRequestId();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      capture_method: 'manual',
      payment_method_types: ['card'],
      metadata: {
        request_id: requestId,
        purpose: 'auction_bid_authorization',
        autograph_id: autographId,
        bidder_id: user.id,
      },
    }, {
      idempotencyKey,
    });

    const { data: paymentEvent, error } = await supabaseAdmin
      .from('payment_events')
      .insert({
        provider: 'stripe',
        purpose: 'auction_bid_authorization',
        status: 'created',
        user_id: user.id,
        autograph_id: autographId,
        amount_cents: amountCents,
        currency: 'usd',
        idempotency_key: idempotencyKey,
        stripe_payment_intent_id: paymentIntent.id,
        provider_metadata: {
          request_id: requestId,
          min_bid_cents: minBid,
          seller_id: autograph.owner_id,
          auction_ends_at: autograph.auction_ends_at,
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
        .eq('purpose', 'auction_bid_authorization')
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
          min_bid_cents: minBid,
          reused: true,
        });
      }

      throw new Error(error?.message ?? 'Could not create payment event.');
    }

    return json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      payment_event_id: paymentEvent.id,
      amount_cents: amountCents,
      min_bid_cents: minBid,
      reused: false,
    });
  }, req)
);

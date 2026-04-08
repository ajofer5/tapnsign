import {
  assert,
  getAutographForUpdate,
  handleRequest,
  json,
  parseJson,
  requireString,
  requireUser,
  stripe,
  supabaseAdmin,
} from '../_shared/utils.ts';
import { requireVerifiedUser } from '../_shared/marketplace.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    await requireVerifiedUser(user.id);

    const body = await parseJson(request);
    const autographId = requireString(body.autograph_id, 'autograph_id');
    const paymentEventId = requireString(body.payment_event_id, 'payment_event_id');

    const autograph = await getAutographForUpdate(autographId);
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.is_for_sale, 409, 'Autograph is not listed for sale.');
    assert(autograph.listing_type === 'auction', 409, 'Autograph is not an auction listing.');
    assert(autograph.owner_id !== user.id, 409, 'You cannot bid on your own autograph.');
    assert(autograph.auction_ends_at && new Date(autograph.auction_ends_at).getTime() > Date.now(), 409, 'Auction has ended.');

    const { data: paymentEvent, error: paymentEventError } = await supabaseAdmin
      .from('payment_events')
      .select('id, user_id, autograph_id, purpose, status, amount_cents, stripe_payment_intent_id')
      .eq('id', paymentEventId)
      .single();

    if (paymentEventError || !paymentEvent) {
      throw new Error(paymentEventError?.message ?? 'Payment event not found.');
    }

    assert(paymentEvent.user_id === user.id, 403, 'Payment event does not belong to this user.');
    assert(paymentEvent.autograph_id === autographId, 409, 'Payment event does not match this autograph.');
    assert(paymentEvent.purpose === 'auction_bid_authorization', 409, 'Payment event purpose mismatch.');
    assert(['created', 'authorized'].includes(paymentEvent.status), 409, 'Payment event is no longer usable.');
    assert(typeof paymentEvent.stripe_payment_intent_id === 'string', 409, 'Payment intent reference missing.');

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentEvent.stripe_payment_intent_id);
    assert(paymentIntent.status === 'requires_capture', 409, 'Bid payment authorization is not ready for capture.');

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

    assert(paymentEvent.amount_cents >= minBid, 409, `Bid must be at least ${minBid} cents.`);

    const { data: result, error: rpcError } = await supabaseAdmin
      .rpc('rpc_place_bid', {
        p_payment_event_id: paymentEvent.id,
        p_bidder_id: user.id,
      });

    if (rpcError || !result) {
      throw new Error(rpcError?.message ?? 'Could not place bid.');
    }

    const outbidRecords = Array.isArray(result.outbid_payment_intents)
      ? result.outbid_payment_intents
      : [];

    for (const record of outbidRecords) {
      const paymentIntentId = typeof record?.payment_intent_id === 'string' ? record.payment_intent_id : null;
      const paymentEventIdToCancel = typeof record?.payment_event_id === 'string' ? record.payment_event_id : null;
      if (!paymentIntentId || !paymentEventIdToCancel) continue;

      try {
        await stripe.paymentIntents.cancel(paymentIntentId);
        await supabaseAdmin
          .from('payment_events')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
          })
          .eq('id', paymentEventIdToCancel);
      } catch (error) {
        console.error('Failed to release outbid authorization:', paymentIntentId, error);
      }
    }

    const { data: bid, error: bidReadError } = await supabaseAdmin
      .from('bids')
      .select('id, amount_cents, created_at')
      .eq('id', result.bid_id)
      .single();

    if (bidReadError || !bid) {
      throw new Error(bidReadError?.message ?? 'Bid was created but could not be read back.');
    }

    return json({
      bid: {
        id: bid.id,
        autograph_id: autographId,
        amount_cents: bid.amount_cents,
        payment_event_id: paymentEvent.id,
        payment_intent_id: paymentEvent.stripe_payment_intent_id,
        created_at: bid.created_at,
        status: result.status,
      },
    });
  }, req)
);

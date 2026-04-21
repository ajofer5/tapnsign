import {
  assert,
  getAutographDisplayLabel,
  handleRequest,
  json,
  logInterestEvent,
  notifyUser,
  parseJson,
  requireString,
  requireUser,
  stripe,
  supabaseAdmin,
} from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const body = await parseJson(request);

    const offerId = requireString(body.offer_id, 'offer_id');
    const paymentEventId = requireString(body.payment_event_id, 'payment_event_id');

    const { data: offer, error: offerError } = await supabaseAdmin
      .from('autograph_offers')
      .select('id, buyer_id, autograph_id, amount_cents, status, payment_event_id, accepted_transfer_id')
      .eq('id', offerId)
      .single();

    if (offerError || !offer) {
      throw new Error(offerError?.message ?? 'Offer not found.');
    }

    assert(offer.buyer_id === user.id, 403, 'Offer does not belong to this user.');
    assert(offer.status === 'accepted', 409, 'Offer is not accepted.');
    assert(!offer.accepted_transfer_id, 409, 'Offer purchase is already complete.');
    assert(!offer.payment_event_id || offer.payment_event_id === paymentEventId, 409, 'Payment event does not match the current offer purchase session.');

    const { data: paymentEvent, error: paymentEventError } = await supabaseAdmin
      .from('payment_events')
      .select('id, user_id, autograph_id, purpose, status, amount_cents, stripe_payment_intent_id, provider_metadata')
      .eq('id', paymentEventId)
      .single();

    if (paymentEventError || !paymentEvent) {
      throw new Error(paymentEventError?.message ?? 'Payment event not found.');
    }

    assert(paymentEvent.user_id === user.id, 403, 'Payment event does not belong to this user.');
    assert(paymentEvent.autograph_id === offer.autograph_id, 409, 'Payment event does not match this autograph.');
    assert(paymentEvent.purpose === 'accepted_offer_purchase', 409, 'Payment event purpose mismatch.');
    assert(['created', 'captured'].includes(paymentEvent.status), 409, 'Payment event is no longer usable.');
    assert(paymentEvent.amount_cents === offer.amount_cents, 409, 'Payment amount no longer matches offer.');
    assert(paymentEvent.provider_metadata?.offer_id === offerId, 409, 'Payment event does not match this offer.');
    assert(typeof paymentEvent.stripe_payment_intent_id === 'string', 409, 'Payment intent reference missing.');

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentEvent.stripe_payment_intent_id);
    assert(paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing', 409, 'Payment has not completed.');

    const { data: result, error: rpcError } = await supabaseAdmin
      .rpc('rpc_finalize_offer_purchase', {
        p_offer_id: offerId,
        p_payment_event_id: paymentEvent.id,
        p_buyer_id: user.id,
      });

    if (rpcError || !result) {
      throw new Error(rpcError?.message ?? 'Could not finalize offer purchase.');
    }

    await logInterestEvent({
      userId: user.id,
      eventType: 'purchase_completed',
      autographId: offer.autograph_id,
    });

    const label = await getAutographDisplayLabel(offer.autograph_id);
    const sellerId = paymentEvent.provider_metadata?.seller_id as string | undefined;
    if (sellerId) {
      await notifyUser(
        sellerId,
        'Offer Purchase Complete',
        `${label} was purchased and ownership transferred successfully.`
      );
    }

    return json({
      purchase: {
        autograph_id: offer.autograph_id,
        offer_id: offerId,
        transfer_id: result.transfer_id,
        payment_event_id: paymentEvent.id,
        owner_id: result.owner_id ?? user.id,
        status: result.status,
      },
    });
  }, req)
);

import { assert, getAutographForUpdate, getIdempotencyKey, getRequestId, handleRequest, json, parseJson, requireString, requireUser, stripe, supabaseAdmin } from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const body = await parseJson(request);

    const offerId = requireString(body.offer_id, 'offer_id');

    const { data: offer, error: offerError } = await supabaseAdmin
      .from('autograph_offers')
      .select('id, autograph_id, buyer_id, owner_id, amount_cents, status, payment_due_at, payment_event_id, accepted_transfer_id')
      .eq('id', offerId)
      .single();

    if (offerError || !offer) {
      throw new Error(offerError?.message ?? 'Offer not found.');
    }

    assert(offer.buyer_id === user.id, 403, 'Offer does not belong to this user.');
    assert(offer.status === 'accepted', 409, 'Offer is not accepted.');
    assert(!offer.accepted_transfer_id, 409, 'Offer purchase is already complete.');
    assert(!offer.payment_due_at || new Date(offer.payment_due_at).getTime() > Date.now(), 409, 'Offer payment window has expired.');

    const autograph = await getAutographForUpdate(offer.autograph_id);
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.owner_id === offer.owner_id, 409, 'Owner changed before purchase could begin.');
    assert(autograph.owner_id !== user.id, 409, 'You already own this autograph.');

    const idempotencyKey = getIdempotencyKey(request, body, `offer-purchase:${user.id}:${offerId}`);

    const { data: existingEvent } = await supabaseAdmin
      .from('payment_events')
      .select('id, stripe_payment_intent_id, amount_cents, provider_metadata')
      .eq('user_id', user.id)
      .eq('autograph_id', offer.autograph_id)
      .eq('purpose', 'accepted_offer_purchase')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['created', 'requires_action', 'authorized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const canReuseExistingEvent =
      !!existingEvent?.stripe_payment_intent_id &&
      existingEvent.amount_cents === offer.amount_cents &&
      existingEvent.provider_metadata?.offer_id === offerId &&
      existingEvent.provider_metadata?.seller_id === offer.owner_id;

    if (canReuseExistingEvent) {
      if (offer.payment_event_id !== existingEvent.id) {
        await supabaseAdmin
          .from('autograph_offers')
          .update({ payment_event_id: existingEvent.id })
          .eq('id', offerId);
      }

      const existingIntent = await stripe.paymentIntents.retrieve(existingEvent.stripe_payment_intent_id);
      return json({
        client_secret: existingIntent.client_secret,
        payment_intent_id: existingIntent.id,
        payment_event_id: existingEvent.id,
        amount_cents: existingEvent.amount_cents,
        payment_status: existingIntent.status,
        reused: true,
      });
    }

    const requestId = getRequestId();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: offer.amount_cents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        request_id: requestId,
        purpose: 'accepted_offer_purchase',
        autograph_id: offer.autograph_id,
        offer_id: offerId,
        buyer_id: user.id,
        seller_id: offer.owner_id,
      },
    }, {
      idempotencyKey,
    });

    const { data: paymentEvent, error } = await supabaseAdmin
      .from('payment_events')
      .insert({
        provider: 'stripe',
        purpose: 'accepted_offer_purchase',
        status: 'created',
        user_id: user.id,
        autograph_id: offer.autograph_id,
        amount_cents: offer.amount_cents,
        currency: 'usd',
        idempotency_key: idempotencyKey,
        stripe_payment_intent_id: paymentIntent.id,
        provider_metadata: {
          request_id: requestId,
          seller_id: offer.owner_id,
          offer_id: offerId,
        },
      })
      .select('id')
      .single();

    if (error || !paymentEvent) {
      throw new Error(error?.message ?? 'Could not create payment event.');
    }

    await supabaseAdmin
      .from('autograph_offers')
      .update({ payment_event_id: paymentEvent.id })
      .eq('id', offerId);

    return json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      payment_event_id: paymentEvent.id,
      amount_cents: offer.amount_cents,
      payment_status: paymentIntent.status,
      reused: false,
    });
  }, req)
);

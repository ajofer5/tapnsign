import {
  assert,
  assertUsersNotBlocked,
  getAutographForUpdate,
  getProfile,
  handleRequest,
  json,
  parseJson,
  requireString,
  requireUser,
  stripe,
  supabaseAdmin,
} from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(profile.is_creator === true, 403, 'You must be 18 or older to purchase autographs.');

    const body = await parseJson(request);

    const autographId = requireString(body.autograph_id, 'autograph_id');
    const paymentEventId = requireString(body.payment_event_id, 'payment_event_id');

    const autograph = await getAutographForUpdate(autographId);
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.is_for_sale, 409, 'Autograph is not listed for sale.');
    assert(autograph.sale_state === 'fixed', 409, 'Autograph is not an active listing.');
    assert(autograph.listing_mode === 'buy_now', 409, 'Autograph is not available for direct purchase.');
    assert(autograph.owner_id !== user.id, 409, 'You already own this autograph.');
    await assertUsersNotBlocked(user.id, autograph.owner_id, 'You cannot purchase from this user.');
    assert(typeof autograph.price_cents === 'number' && autograph.price_cents > 0, 409, 'Listing price is invalid.');

    const { data: acceptedOfferLock } = await supabaseAdmin
      .from('autograph_offers')
      .select('id')
      .eq('autograph_id', autographId)
      .eq('status', 'accepted')
      .is('accepted_transfer_id', null)
      .gt('payment_due_at', new Date().toISOString())
      .maybeSingle();

    assert(!acceptedOfferLock, 409, 'Autograph is currently locked for an accepted offer.');

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
    assert(paymentEvent.purpose === 'fixed_price_purchase', 409, 'Payment event purpose mismatch.');
    assert(['created', 'captured'].includes(paymentEvent.status), 409, 'Payment event is no longer usable.');
    assert(paymentEvent.amount_cents === autograph.price_cents, 409, 'Payment amount no longer matches listing price.');
    assert(typeof paymentEvent.stripe_payment_intent_id === 'string', 409, 'Payment intent reference missing.');

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentEvent.stripe_payment_intent_id);
    assert(paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing', 409, 'Payment has not completed.');

    const { data: result, error: rpcError } = await supabaseAdmin
      .rpc('rpc_finalize_purchase', {
        p_payment_event_id: paymentEvent.id,
        p_buyer_id: user.id,
      });

    if (rpcError || !result) {
      throw new Error(rpcError?.message ?? 'Could not finalize purchase.');
    }

    return json({
      purchase: {
        autograph_id: autographId,
        transfer_id: result.transfer_id,
        payment_event_id: paymentEvent.id,
        owner_id: result.owner_id ?? user.id,
        status: result.status,
      },
    });
  }, req)
);

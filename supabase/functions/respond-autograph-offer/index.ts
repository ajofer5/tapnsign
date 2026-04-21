import {
  assert,
  expireOffersAndNotify,
  getAutographDisplayLabel,
  getAutographForUpdate,
  handleRequest,
  json,
  notifyUser,
  parseJson,
  requireString,
  requireUser,
  supabaseAdmin,
} from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    await expireOffersAndNotify();

    const body = await parseJson(request);
    const offerId = requireString(body.offer_id, 'offer_id');
    const action = requireString(body.action, 'action');

    assert(action === 'accept' || action === 'decline', 400, 'action must be accept or decline.');

    const { data: offer, error } = await supabaseAdmin
      .from('autograph_offers')
      .select('id, autograph_id, owner_id, buyer_id, status, expires_at')
      .eq('id', offerId)
      .single();

    if (error || !offer) {
      throw new Error(error?.message ?? 'Offer not found.');
    }

    assert(offer.owner_id === user.id, 403, 'Only the owner can respond to this offer.');
    assert(offer.status === 'pending', 409, 'Offer is no longer pending.');
    assert(new Date(offer.expires_at).getTime() > Date.now(), 409, 'Offer has expired.');

    const autograph = await getAutographForUpdate(offer.autograph_id);
    assert(autograph.owner_id === user.id, 409, 'You no longer own this autograph.');
    assert(autograph.status === 'active', 409, 'Autograph is not active.');

    const nextStatus = action === 'accept' ? 'accepted' : 'declined';
    const respondedAt = new Date().toISOString();
    const paymentDueAt = action === 'accept'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data: updatedOffer, error: updateError } = await supabaseAdmin
      .from('autograph_offers')
      .update({
        status: nextStatus,
        responded_at: respondedAt,
        accepted_at: action === 'accept' ? respondedAt : null,
        payment_due_at: paymentDueAt,
      })
      .eq('id', offerId)
      .eq('status', 'pending')
      .select('id, status, responded_at, payment_due_at')
      .single();

    if (updateError || !updatedOffer) {
      throw new Error(updateError?.message ?? `Could not ${action} offer.`);
    }

    if (action === 'accept') {
      const { error: otherOffersError } = await supabaseAdmin
        .from('autograph_offers')
        .update({
          status: 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('autograph_id', offer.autograph_id)
        .eq('status', 'pending')
        .neq('id', offerId);

      if (otherOffersError) {
        throw new Error(otherOffersError.message);
      }
    }

    const label = await getAutographDisplayLabel(offer.autograph_id);
    if (action === 'accept') {
      await notifyUser(
        offer.buyer_id,
        'Offer Accepted',
        `Your offer on ${label} was accepted. Complete purchase within 24 hours.`
      );
    } else {
      await notifyUser(
        offer.buyer_id,
        'Offer Declined',
        `Your offer on ${label} was declined.`
      );
    }

    return json({ offer: updatedOffer });
  }, req)
);

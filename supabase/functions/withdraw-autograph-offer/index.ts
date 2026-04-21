import {
  assert,
  expireOffersAndNotify,
  getAutographDisplayLabel,
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

    const { data: offer, error } = await supabaseAdmin
      .from('autograph_offers')
      .select('id, autograph_id, buyer_id, owner_id, status')
      .eq('id', offerId)
      .single();

    if (error || !offer) {
      throw new Error(error?.message ?? 'Offer not found.');
    }

    assert(offer.buyer_id === user.id, 403, 'Only the buyer can withdraw this offer.');
    assert(offer.status === 'pending', 409, 'Offer is no longer pending.');

    const { data: updatedOffer, error: updateError } = await supabaseAdmin
      .from('autograph_offers')
      .update({
        status: 'withdrawn',
        responded_at: new Date().toISOString(),
      })
      .eq('id', offerId)
      .eq('status', 'pending')
      .select('id, status, responded_at')
      .single();

    if (updateError || !updatedOffer) {
      throw new Error(updateError?.message ?? 'Could not withdraw offer.');
    }

    const label = await getAutographDisplayLabel(offer.autograph_id);
    await notifyUser(
      offer.owner_id,
      'Offer Withdrawn',
      `An offer on ${label} was withdrawn.`
    );

    return json({ offer: updatedOffer });
  }, req)
);

import { requireVerifiedUser } from '../_shared/marketplace.ts';
import {
  assert,
  getAutographForUpdate,
  handleRequest,
  json,
  parseJson,
  requireString,
  requireUser,
  supabaseAdmin,
} from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    await requireVerifiedUser(user.id);

    const body = await parseJson(request);
    const offeredAutographId = requireString(body.offered_autograph_id, 'offered_autograph_id');
    const targetAutographId = requireString(body.target_autograph_id, 'target_autograph_id');

    assert(offeredAutographId !== targetAutographId, 400, 'Cannot offer the same autograph.');

    const offered = await getAutographForUpdate(offeredAutographId);
    const target = await getAutographForUpdate(targetAutographId);

    assert(offered.status === 'active', 409, 'Offered autograph is not active.');
    assert(target.status === 'active', 409, 'Target autograph is not active.');
    assert(offered.owner_id === user.id, 403, 'You do not own the offered autograph.');
    assert(target.owner_id !== user.id, 409, 'You already own the target autograph.');
    assert(target.open_to_trade === true, 409, 'Target autograph is not open to trade.');
    assert(offered.is_for_sale === false, 409, 'Offered autograph cannot be listed for sale.');
    assert(target.owner_id !== offered.owner_id, 409, 'Trade requires two different owners.');

    const { data: existingPending } = await supabaseAdmin
      .from('trade_offers')
      .select('id')
      .eq('offered_autograph_id', offeredAutographId)
      .eq('target_autograph_id', targetAutographId)
      .eq('status', 'pending')
      .maybeSingle();

    assert(!existingPending, 409, 'A pending offer already exists for this pair.');

    const { data: tradeOffer, error } = await supabaseAdmin
      .from('trade_offers')
      .insert({
        offerer_id: user.id,
        offered_autograph_id: offeredAutographId,
        target_owner_id: target.owner_id,
        target_autograph_id: targetAutographId,
        status: 'pending',
      })
      .select('id, created_at')
      .single();

    if (error || !tradeOffer) {
      throw new Error(error?.message ?? 'Could not create trade offer.');
    }

    return json({
      trade_offer: {
        id: tradeOffer.id,
        offered_autograph_id: offeredAutographId,
        target_autograph_id: targetAutographId,
        target_owner_id: target.owner_id,
        status: 'pending',
        created_at: tradeOffer.created_at,
      },
    });
  }, req)
);

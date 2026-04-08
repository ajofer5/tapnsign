import {
  assert,
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
    const body = await parseJson(request);

    const tradeOfferId = requireString(body.trade_offer_id, 'trade_offer_id');
    const action = requireString(body.action, 'action');

    assert(action === 'accept' || action === 'decline', 400, 'action must be accept or decline.');

    const { data: tradeOffer, error: tradeOfferError } = await supabaseAdmin
      .from('trade_offers')
      .select(`
        id,
        offerer_id,
        offered_autograph_id,
        target_owner_id,
        target_autograph_id,
        status
      `)
      .eq('id', tradeOfferId)
      .single();

    if (tradeOfferError || !tradeOffer) {
      throw new Error(tradeOfferError?.message ?? 'Trade offer not found.');
    }

    assert(tradeOffer.target_owner_id === user.id, 403, 'Only the target owner can respond to this trade offer.');

    if (action === 'decline') {
      const { data: result, error } = await supabaseAdmin
        .rpc('rpc_respond_trade_offer', {
          p_trade_offer_id: tradeOfferId,
          p_actor_id: user.id,
          p_action: 'decline',
        });

      if (error || !result) {
        throw new Error(error?.message ?? 'Could not decline trade offer.');
      }

      return json({
        trade_offer: {
          id: tradeOfferId,
          status: result.status,
        },
      });
    }

    const { data: result, error: rpcError } = await supabaseAdmin
      .rpc('rpc_respond_trade_offer', {
        p_trade_offer_id: tradeOfferId,
        p_actor_id: user.id,
        p_action: 'accept',
      });

    if (rpcError || !result) {
      throw new Error(rpcError?.message ?? 'Could not accept trade offer.');
    }

    return json({
      trade_offer: {
        id: tradeOfferId,
        status: result.status,
        accepted_transfer_id: result.accepted_transfer_id,
        mirror_transfer_id: result.mirror_transfer_id ?? null,
      },
    });
  }, req)
);

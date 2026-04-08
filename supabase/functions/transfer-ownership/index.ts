import { transferAutographOwnership } from '../_shared/marketplace.ts';
import {
  assert,
  getAutographForUpdate,
  getProfile,
  handleRequest,
  json,
  parseJson,
  requirePositiveInteger,
  requireString,
  requireUser,
} from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const body = await parseJson(request);
    const profile = await getProfile(user.id);

    const autographId = requireString(body.autograph_id, 'autograph_id');
    const toUserId = requireString(body.to_user_id, 'to_user_id');
    const transferType = requireString(body.transfer_type, 'transfer_type');
    const ownershipSource = requireString(body.ownership_source, 'ownership_source');
    const tradeOfferId = typeof body.trade_offer_id === 'string' ? body.trade_offer_id : null;
    const paymentEventId = typeof body.payment_event_id === 'string' ? body.payment_event_id : null;
    const priceCents = body.price_cents === undefined || body.price_cents === null
      ? null
      : requirePositiveInteger(body.price_cents, 'price_cents');

    assert(profile.role === 'admin', 403, 'transfer-ownership is admin-only.');
    assert(
      ['primary_sale', 'secondary_sale', 'trade', 'admin_adjustment', 'gift'].includes(transferType),
      400,
      'Unsupported transfer_type.'
    );
    assert(['purchase', 'auction', 'trade', 'admin'].includes(ownershipSource), 400, 'Unsupported ownership_source.');
    assert(toUserId !== user.id, 400, 'to_user_id must differ from the current user.');

    const autograph = await getAutographForUpdate(autographId);
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.owner_id === user.id, 403, 'Only the current owner can transfer this autograph.');

    const transferId = await transferAutographOwnership({
      autographId,
      fromUserId: user.id,
      toUserId,
      ownershipSource: ownershipSource as 'purchase' | 'auction' | 'trade' | 'admin',
      transferType: transferType as 'primary_sale' | 'secondary_sale' | 'trade' | 'admin_adjustment' | 'gift',
      priceCents,
      tradeOfferId,
      paymentEventId,
    });

    return json({
      transfer: {
        id: transferId,
        autograph_id: autographId,
        from_user_id: user.id,
        to_user_id: toUserId,
      },
    });
  }, req)
);

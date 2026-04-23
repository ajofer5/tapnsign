import { requireActiveOwnedAutograph, updateAutographListing } from '../_shared/marketplace.ts';
import {
  assert,
  getProfile,
  handleRequest,
  json,
  parseBoolean,
  parseJson,
  requirePositiveInteger,
  requireString,
  requireUser,
} from '../_shared/utils.ts';

const MIN_PRICE_CENTS = 1000; // $10.00

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const body = await parseJson(request);

    const autographId = requireString(body.autograph_id, 'autograph_id');
    const openToTrade = parseBoolean(body.open_to_trade, false);
    const autoDeclineBelow = parseBoolean(body.auto_decline_below, false);
    const autoAcceptAbove = parseBoolean(body.auto_accept_above, false);

    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    const autograph = await requireActiveOwnedAutograph(autographId, user.id);
    assert(autograph.owner_id === user.id, 403, 'You do not own this autograph.');

    const priceCents = requirePositiveInteger(body.price_cents, 'price_cents');
    assert(priceCents >= MIN_PRICE_CENTS, 400, `Estimated value must be at least $${(MIN_PRICE_CENTS / 100).toFixed(2)}.`);

    await updateAutographListing({
      autographId,
      visibility: 'public',
      saleState: 'fixed',
      isForSale: true,
      priceCents,
      openToTrade,
      autoDeclineBelow,
      autoAcceptAbove,
    });

    return json({
      listing: {
        autograph_id: autographId,
        price_cents: priceCents,
        open_to_trade: openToTrade,
        auto_decline_below: autoDeclineBelow,
        auto_accept_above: autoAcceptAbove,
      },
    });
  }, req)
);

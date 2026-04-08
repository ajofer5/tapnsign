import { requireActiveOwnedAutograph, updateAutographListing } from '../_shared/marketplace.ts';
import {
  assert,
  getProfile,
  handleRequest,
  json,
  parseBoolean,
  parseIsoDate,
  parseJson,
  requirePositiveInteger,
  requireString,
  requireUser,
  supabaseAdmin,
} from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const body = await parseJson(request);

    const autographId = requireString(body.autograph_id, 'autograph_id');
    const listingType = requireString(body.listing_type, 'listing_type');
    const openToTrade = parseBoolean(body.open_to_trade, false);

    assert(listingType === 'fixed' || listingType === 'auction', 400, 'listing_type must be fixed or auction.');

    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    const autograph = await requireActiveOwnedAutograph(autographId, user.id);
    assert(autograph.owner_id === user.id, 403, 'You do not own this autograph.');

    const { count: activeBidCount } = await supabaseAdmin
      .from('bids')
      .select('id', { count: 'exact', head: true })
      .eq('autograph_id', autographId)
      .eq('status', 'active');

    assert(!activeBidCount, 409, 'Cannot change listing state while active bids exist.');

    if (listingType === 'fixed') {
      const priceCents = requirePositiveInteger(body.price_cents, 'price_cents');
      await updateAutographListing({
        autographId,
        isForSale: true,
        listingType: 'fixed',
        priceCents,
        openToTrade,
      });

      return json({
        listing: {
          autograph_id: autographId,
          listing_type: 'fixed',
          price_cents: priceCents,
          open_to_trade: openToTrade,
        },
      });
    }

    const reservePriceCents = requirePositiveInteger(body.reserve_price_cents, 'reserve_price_cents');
    const auctionEndsAt = parseIsoDate(body.auction_ends_at, 'auction_ends_at');
    assert(auctionEndsAt.getTime() > Date.now(), 400, 'auction_ends_at must be in the future.');

    await updateAutographListing({
      autographId,
      isForSale: true,
      listingType: 'auction',
      reservePriceCents,
      auctionEndsAt: auctionEndsAt.toISOString(),
      openToTrade: false,
    });

    return json({
      listing: {
        autograph_id: autographId,
        listing_type: 'auction',
        reserve_price_cents: reservePriceCents,
        auction_ends_at: auctionEndsAt.toISOString(),
      },
    });
  }, req)
);

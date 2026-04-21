import { requireActiveOwnedAutograph, updateAutographListing } from '../_shared/marketplace.ts';
import { assert, getProfile, handleRequest, json, parseJson, requireString, requireUser } from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const body = await parseJson(request);

    const autographId = requireString(body.autograph_id, 'autograph_id');

    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    const autograph = await requireActiveOwnedAutograph(autographId, user.id);

    await updateAutographListing({
      autographId,
      visibility: autograph.visibility ?? 'private',
      saleState: 'not_for_sale',
      isForSale: false,
      priceCents: null,
      openToTrade: false,
    });

    return json({ success: true });
  }, req)
);

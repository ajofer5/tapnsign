import { requireActiveOwnedAutograph } from '../_shared/marketplace.ts';
import {
  assert,
  getProfile,
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

    const autographId = requireString(body.autograph_id, 'autograph_id');

    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    const autograph = await requireActiveOwnedAutograph(autographId, user.id);

    // Block if listed — require unlisting first
    assert(!autograph.is_for_sale, 409, 'Please unlist this autograph before deleting it.');

    // Block if there are pending outgoing trade offers on this autograph
    const { count: pendingOfferCount } = await supabaseAdmin
      .from('trade_offers')
      .select('id', { count: 'exact', head: true })
      .eq('offered_autograph_id', autographId)
      .eq('status', 'pending');

    assert(!pendingOfferCount, 409, 'This autograph has a pending trade offer. Please wait for it to be resolved before deleting.');

    // Soft delete
    const { error } = await supabaseAdmin
      .from('autographs')
      .update({ status: 'deleted' })
      .eq('id', autographId)
      .eq('owner_id', user.id);

    assert(!error, 500, error?.message ?? 'Could not delete autograph.');

    return json({ success: true });
  }, req)
);

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
    const visibility = requireString(body.visibility, 'visibility');
    assert(visibility === 'private' || visibility === 'public', 400, 'visibility must be private or public.');

    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    const autograph = await requireActiveOwnedAutograph(autographId, user.id);
    assert(autograph.sale_state === 'not_for_sale', 409, 'Only not-for-sale autographs can change visibility directly.');
    assert(!autograph.is_for_sale, 409, 'Listed autographs cannot change visibility directly.');

    const { error } = await supabaseAdmin
      .from('autographs')
      .update({ visibility })
      .eq('id', autographId)
      .eq('owner_id', user.id);

    assert(!error, 500, error?.message ?? 'Could not update visibility.');

    return json({
      autograph: {
        id: autographId,
        visibility,
        sale_state: 'not_for_sale',
      },
    });
  }, req)
);

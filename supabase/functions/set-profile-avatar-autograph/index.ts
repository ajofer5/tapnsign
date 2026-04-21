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
    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    const body = await parseJson(request);
    const autographId = typeof body.autograph_id === 'string' && body.autograph_id.trim().length > 0
      ? requireString(body.autograph_id, 'autograph_id')
      : null;

    if (!autographId) {
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({
          profile_avatar_autograph_id: null,
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      assert(!error, 500, error?.message ?? 'Could not clear profile image.');
      return json({ profile_avatar_autograph_id: null, avatar_url: null });
    }

    const { data: autograph, error: autographError } = await supabaseAdmin
      .from('autographs')
      .select('id, creator_id, status, thumbnail_url')
      .eq('id', autographId)
      .single();

    assert(!autographError && autograph, 404, 'Autograph not found.');
    assert(autograph.creator_id === user.id, 403, 'You can only use self-created autographs as your profile image.');
    assert(autograph.status === 'active', 400, 'Only active autographs can be used as a profile image.');

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        profile_avatar_autograph_id: autograph.id,
        avatar_url: autograph.thumbnail_url ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    assert(!error, 500, error?.message ?? 'Could not set profile image.');

    return json({
      profile_avatar_autograph_id: autograph.id,
      avatar_url: autograph.thumbnail_url ?? null,
    });
  }, req)
);

import {
  HttpError,
  assert,
  getProfile,
  handleRequest,
  json,
  parseJson,
  requireString,
  requireUser,
  supabaseAdmin,
} from '../_shared/utils.ts';

function requireStringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, `${field} is required.`);
  }

  const items = value.map((entry) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new HttpError(400, `${field} must contain valid IDs.`);
    }
    return entry.trim();
  });

  return items;
}

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    const body = await parseJson(request);
    const name = requireString(body.name, 'name');
    const autographIds = requireStringArray(body.autograph_ids, 'autograph_ids');

    const { data, error } = await supabaseAdmin.rpc('rpc_create_locked_series', {
      p_creator_id: user.id,
      p_name: name,
      p_autograph_ids: autographIds,
    });

    if (error || !data) {
      throw new Error(error?.message ?? 'Could not create series.');
    }

    return json(data);
  }, req)
);

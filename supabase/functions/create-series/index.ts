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

const SERIES_NAME_MAX_LENGTH = 20;
const STANDARD_CAP = 50;
const LIMITED_CAP = 25;

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    const body = await parseJson(request);
    const name = requireString(body.name, 'name');
    const type: string = body.type === 'limited' ? 'limited' : 'standard';

    assert(
      name.length <= SERIES_NAME_MAX_LENGTH,
      400,
      `Series name must be ${SERIES_NAME_MAX_LENGTH} characters or fewer.`
    );

    const maxSize = type === 'limited' ? LIMITED_CAP : STANDARD_CAP;

    const { data: series, error } = await supabaseAdmin
      .from('series')
      .insert({
        creator_id: user.id,
        name,
        type,
        max_size: maxSize,
      })
      .select('id, name, type, max_size, created_at')
      .single();

    if (error || !series) {
      throw new Error(error?.message ?? 'Could not create series.');
    }

    return json({ series });
  }, req)
);

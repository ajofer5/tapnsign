import {
  getProfile,
  handleRequest,
  json,
  requireUser,
  supabaseAdmin,
  assert,
} from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    const { data: seriesList, error } = await supabaseAdmin
      .from('series')
      .select('id, name, type, max_size, created_at')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    // Get member counts for each series
    const ids = (seriesList ?? []).map((s: any) => s.id);
    let countMap: Record<string, number> = {};

    if (ids.length > 0) {
      const { data: counts } = await supabaseAdmin
        .from('autographs')
        .select('series_id')
        .in('series_id', ids)
        .eq('status', 'active');

      for (const row of counts ?? []) {
        countMap[row.series_id] = (countMap[row.series_id] ?? 0) + 1;
      }
    }

    const result = (seriesList ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      max_size: s.max_size,
      count: countMap[s.id] ?? 0,
      created_at: s.created_at,
    }));

    return json({ series: result });
  }, req)
);

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
    const autographId = requireString(body.autograph_id, 'autograph_id');
    const seriesId = requireString(body.series_id, 'series_id');

    // Verify the autograph belongs to this user and is active
    const { data: autograph } = await supabaseAdmin
      .from('autographs')
      .select('id, creator_id, status, series_id')
      .eq('id', autographId)
      .single();

    assert(autograph, 404, 'Autograph not found.');
    assert(autograph.creator_id === user.id, 403, 'You are not the creator of this autograph.');
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(!autograph.series_id, 409, 'Autograph is already assigned to a series.');

    // Verify the series belongs to this user
    const { data: series } = await supabaseAdmin
      .from('series')
      .select('id, creator_id, max_size, name, type')
      .eq('id', seriesId)
      .single();

    assert(series, 404, 'Series not found.');
    assert(series.creator_id === user.id, 403, 'You do not own this series.');

    // Count current members of the series
    const { count: currentCount } = await supabaseAdmin
      .from('autographs')
      .select('id', { count: 'exact', head: true })
      .eq('series_id', seriesId);

    assert(
      (currentCount ?? 0) < series.max_size,
      409,
      `This series is full (${series.max_size} autographs maximum).`
    );

    const nextSequence = (currentCount ?? 0) + 1;

    const { error } = await supabaseAdmin
      .from('autographs')
      .update({
        series_id: seriesId,
        series_sequence_number: nextSequence,
      })
      .eq('id', autographId)
      .eq('creator_id', user.id);

    assert(!error, 500, error?.message ?? 'Could not assign autograph to series.');

    return json({
      success: true,
      series_name: series.name,
      series_sequence_number: nextSequence,
    });
  }, req)
);

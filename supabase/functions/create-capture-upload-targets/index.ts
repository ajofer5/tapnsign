import {
  assert,
  getProfile,
  handleRequest,
  json,
  parseBoolean,
  parseJson,
  requireUser,
  supabaseAdmin,
} from '../_shared/utils.ts';

const STORAGE_BUCKET = 'autograph-videos';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(profile.role === 'verified' && profile.verification_status === 'verified', 403, 'Only verified accounts can capture autographs.');

    const body = await parseJson(request);
    const includeThumbnail = parseBoolean(body.include_thumbnail, false);

    const baseName = `${Date.now()}-${crypto.randomUUID()}`;
    const videoPath = `${user.id}/${baseName}.mov`;
    const thumbnailPath = includeThumbnail ? `${user.id}/${baseName}_thumb.jpg` : null;

    const { data: videoTarget, error: videoError } = await supabaseAdmin
      .storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(videoPath);

    assert(!videoError && videoTarget, 500, videoError?.message ?? 'Could not create video upload target.');

    let thumbnailTarget: { path: string; token: string; signedUrl: string } | null = null;

    if (thumbnailPath) {
      const { data, error } = await supabaseAdmin
        .storage
        .from(STORAGE_BUCKET)
        .createSignedUploadUrl(thumbnailPath);

      assert(!error && data, 500, error?.message ?? 'Could not create thumbnail upload target.');
      thumbnailTarget = data;
    }

    return json({
      bucket: STORAGE_BUCKET,
      video: videoTarget,
      thumbnail: thumbnailTarget,
    });
  }, req)
);

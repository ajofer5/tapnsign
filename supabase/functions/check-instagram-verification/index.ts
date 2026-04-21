import {
  assert,
  getProfile,
  handleRequest,
  json,
  requireUser,
  supabaseAdmin,
} from '../_shared/utils.ts';

function buildInstagramUrls(handle: string) {
  const normalized = handle.trim().replace(/^@/, '');
  return [
    `https://www.instagram.com/${normalized}/`,
    `https://instagram.com/${normalized}/`,
  ];
}

async function fetchInstagramProfileHtml(handle: string) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
  };

  let lastStatus = 0;
  for (const url of buildInstagramUrls(handle)) {
    const response = await fetch(url, { headers });
    lastStatus = response.status;
    if (response.ok) {
      return await response.text();
    }
  }

  throw new Error(lastStatus ? `Instagram profile could not be reached (${lastStatus}).` : 'Instagram profile could not be reached.');
}

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(!!profile.instagram_handle, 400, 'Add your Instagram handle first.');
    assert(!!profile.instagram_verification_code, 400, 'Start Instagram verification first.');
    assert(!!profile.instagram_verification_expires_at, 400, 'Start Instagram verification first.');

    const now = new Date();
    const expiresAt = new Date(profile.instagram_verification_expires_at);
    assert(!Number.isNaN(expiresAt.getTime()), 400, 'Instagram verification expiry is invalid.');

    const checkedAtIso = now.toISOString();

    if (expiresAt.getTime() <= now.getTime()) {
      await supabaseAdmin
        .from('profiles')
        .update({
          instagram_verification_checked_at: checkedAtIso,
          updated_at: checkedAtIso,
        })
        .eq('id', user.id);

      assert(false, 400, 'This Instagram verification code expired. Start verification again to get a new code.');
    }

    const html = await fetchInstagramProfileHtml(profile.instagram_handle);
    const found = html.includes(profile.instagram_verification_code);

    const updatePayload = found
      ? {
          instagram_status: 'verified',
          instagram_verified_at: checkedAtIso,
          instagram_verification_method: 'bio_code',
          instagram_verification_checked_at: checkedAtIso,
          instagram_verification_code: null,
          instagram_verification_requested_at: null,
          instagram_verification_expires_at: null,
          updated_at: checkedAtIso,
        }
      : {
          instagram_status: 'connected',
          instagram_verification_checked_at: checkedAtIso,
          updated_at: checkedAtIso,
        };

    const { error } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', user.id);

    assert(!error, 500, error?.message ?? 'Could not update Instagram verification.');

    return json({
      instagram_handle: profile.instagram_handle,
      verified: found,
      checked_at: checkedAtIso,
      message: found
        ? 'Instagram bio code verified successfully.'
        : 'The verification code was not found in your Instagram bio yet.',
    });
  }, req)
);

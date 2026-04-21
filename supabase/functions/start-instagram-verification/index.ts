import {
  assert,
  getProfile,
  handleRequest,
  json,
  requireUser,
  supabaseAdmin,
} from '../_shared/utils.ts';

function generateVerificationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chars = Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]);
  return `TNS-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(!!profile.instagram_handle, 400, 'Add your Instagram handle first.');

    const verificationCode = generateVerificationCode();
    const requestedAt = new Date();
    const expiresAt = new Date(requestedAt.getTime() + 1000 * 60 * 30);

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        instagram_status: 'connected',
        instagram_verification_code: verificationCode,
        instagram_verification_requested_at: requestedAt.toISOString(),
        instagram_verification_expires_at: expiresAt.toISOString(),
        instagram_verification_checked_at: null,
        instagram_verified_at: null,
        instagram_verification_method: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    assert(!error, 500, error?.message ?? 'Could not start Instagram verification.');

    return json({
      instagram_handle: profile.instagram_handle,
      verification_code: verificationCode,
      requested_at: requestedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      instructions: 'Add this code to your Instagram bio temporarily, then return to TapnSign to complete verification.',
    });
  }, req)
);

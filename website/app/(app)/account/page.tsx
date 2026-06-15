import Link from 'next/link';
import { updateBioAction, updateDisplayNameAction, updatePersonalizedSettingsAction, updateProfileAvatarAction, useVerifiedNameAction } from './actions';
import { MAX_DISPLAY_NAME_LENGTH } from '../../../lib/display-name';
import { PERSONALIZED_REQUEST_MIN_CENTS } from '../../../lib/personalized-policy';
import { requireWebSessionUser } from '../../../lib/web-auth';
import { createWebsiteAdminSupabaseClient } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

function formatVerificationState(value?: string | null) {
  if (!value || value === 'none') return 'Not Started';
  if (value === 'pending') return 'Pending';
  if (value === 'verified') return 'Verified';
  if (value === 'failed') return 'Failed';
  if (value === 'expired') return 'Expired';
  return value;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const resolvedSearch = await searchParams;
  const user = await requireWebSessionUser();
  const supabase = createWebsiteAdminSupabaseClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      id,
      display_name,
      validated_name,
      name_verified,
      avatar_url,
      bio,
      profile_avatar_autograph_id,
      role,
      verified,
      verification_status,
      personalized_requests_enabled,
      personalized_min_price_cents,
      created_at
    `)
    .eq('id', user.id)
    .single();
  const { data: avatarOptions } = await supabase.rpc('get_owned_listing_feed', {
    p_owner_id: user.id,
    p_limit: 100,
    p_before_created_at: null,
    p_before_id: null,
  });

  const status = resolvedSearch?.status;
  const displayName = profile?.display_name ?? user.display_name;
  const bio = (profile as any)?.bio ?? '';
  const isVerified = !!(profile as any)?.verified;

  const accountStatusLabel = isVerified
    ? 'Verified Creator'
    : (profile as any)?.role === 'verified'
      ? 'Creator'
      : 'Member';

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">

      {/* Status banner */}
      {status ? (
        <div
          className={`mb-6 rounded-lg px-5 py-4 text-sm font-medium ${
            status.includes('error') || status.includes('missing')
              ? 'bg-[#FDECEC] text-[#B3261E]'
              : 'bg-[#EFF6EC] text-[#2B6A1C]'
          }`}
        >
          {status === 'verified_name_saved' && 'Verified name applied. Your badge is now active.'}
          {status === 'name_saved' && 'Display name updated.'}
          {status === 'bio_saved' && 'Bio updated.'}
          {status === 'name_too_long' && `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`}
          {status === 'avatar_saved' && 'Profile image updated.'}
          {status === 'avatar_cleared' && 'Profile image cleared.'}
          {status === 'personalized_saved' && 'Personalized requests enabled.'}
          {status === 'personalized_disabled' && 'Personalized requests disabled.'}
          {status === 'name_missing' && 'Please enter a display name.'}
          {status === 'name_error' && 'Could not save your display name. Please try again.'}
          {status === 'bio_error' && 'Could not save your bio. Please try again.'}
          {status === 'avatar_error' && 'Could not update your profile image. Please try again.'}
          {status === 'personalized_error' && 'Could not save personalized request settings. Please check the minimum price and try again.'}
        </div>
      ) : null}

      {/* Profile card */}
      <div className="mb-4 rounded-[6px] border border-gray-200 bg-white p-5">
        <div className="flex items-start gap-5">
          {/* Portrait avatar */}
          <div className="w-[60px] shrink-0 overflow-hidden rounded-[4px] bg-[#1C1C1F]">
            {(profile as any)?.avatar_url ? (
              <img
                src={(profile as any).avatar_url}
                alt={displayName}
                className="aspect-[3/5] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[3/5] w-full items-center justify-center text-xl font-black text-white/50">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          {/* Name + bio */}
          <div className="min-w-0 flex-1">
            <div className="text-xl font-black text-black">{displayName}</div>
            <div className="mt-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
              {accountStatusLabel}
            </div>
            <form action={updateBioAction} className="mt-3">
              <textarea
                name="bio"
                defaultValue={bio}
                maxLength={100}
                placeholder="Add a short bio…"
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-200 bg-[#F7F7F8] px-3 py-2 text-sm text-black outline-none transition-colors placeholder:text-gray-400 focus:border-[#001B5C] focus:bg-white"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[11px] text-gray-400">{bio.length}/100</span>
                <button
                  type="submit"
                  className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
                >
                  Save Bio
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Account info rows */}
      <div className="mb-4 overflow-hidden rounded-[6px] border border-gray-200 bg-white">
        <AccountRow label="Email" value={user.email ?? '—'} />
        <AccountRow label="Status" value={accountStatusLabel} />
        <AccountRow label="Verification" value={formatVerificationState(profile?.verification_status)} isLast />
      </div>

      {/* Display Name */}
      <div className="mb-4 rounded-[6px] border border-gray-200 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Display Name</p>
        <form action={updateDisplayNameAction} className="mt-4 space-y-3">
          <input
            type="text"
            name="display_name"
            defaultValue={displayName}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            placeholder="Display name"
            className="w-full rounded-lg border border-gray-200 bg-[#F7F7F8] px-4 py-3 text-sm text-black outline-none transition-colors placeholder:text-gray-400 focus:border-[#001B5C] focus:bg-white"
            required
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-[#001B5C] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#00144A]"
          >
            Save Name
          </button>
        </form>
      </div>

      {/* Personalized Requests */}
      <div className="mb-4 rounded-[6px] border border-gray-200 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Personalized Requests</p>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Let collectors request private custom prints directly from your profile.
        </p>
        {isVerified ? (
          <form action={updatePersonalizedSettingsAction} className="mt-4 space-y-3">
            <label className="flex items-center justify-between rounded-lg bg-[#F7F7F8] px-4 py-3 text-sm font-medium text-black">
              <span>Enable personalized print requests</span>
              <input
                type="checkbox"
                name="personalized_requests_enabled"
                defaultChecked={!!(profile as any)?.personalized_requests_enabled}
                className="h-5 w-5 accent-[#001B5C]"
              />
            </label>
            <div className="flex items-center rounded-lg border border-gray-200 bg-[#F7F7F8] px-4 py-3 focus-within:border-[#001B5C] focus-within:bg-white">
              <span className="mr-2 text-sm font-semibold text-gray-500">$</span>
              <input
                type="number"
                name="personalized_min_price"
                min={(PERSONALIZED_REQUEST_MIN_CENTS / 100).toFixed(2)}
                step="0.01"
                defaultValue={
                  (profile as any)?.personalized_min_price_cents
                    ? ((profile as any).personalized_min_price_cents / 100).toFixed(2)
                    : (PERSONALIZED_REQUEST_MIN_CENTS / 100).toFixed(2)
                }
                className="w-full bg-transparent text-sm text-black outline-none placeholder:text-gray-400"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#001B5C] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#00144A]"
            >
              Save Settings
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm leading-6 text-gray-500">
            Available once your Ophinia creator account is verified.
          </p>
        )}
      </div>

      {/* Verified Name Badge */}
      {(profile as any)?.validated_name ? (
        <div className="mb-4 rounded-[6px] border border-gray-200 bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Verified Name Badge</p>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Your identity was verified as{' '}
            <span className="font-semibold text-black">{(profile as any).validated_name}</span>.
          </p>
          {(profile as any)?.name_verified ? (
            <div className="mt-4 flex items-center gap-3 rounded-lg bg-[#EFF6EC] px-4 py-3">
              <span className="text-base">✓</span>
              <div>
                <p className="text-sm font-semibold text-[#2B6A1C]">Badge active</p>
                <p className="text-xs leading-5 text-[#2B6A1C]">Your display name matches your verified name.</p>
              </div>
            </div>
          ) : (
            <form action={useVerifiedNameAction} className="mt-4">
              <button
                type="submit"
                className="w-full rounded-lg bg-[#001B5C] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#00144a]"
              >
                Use verified name &amp; show badge
              </button>
              <p className="mt-3 text-xs leading-5 text-gray-500">
                Your current display name will be replaced with your government-verified name. You can switch back at any time.
              </p>
            </form>
          )}
        </div>
      ) : null}

      {/* Profile Image */}
      <div className="mb-4 rounded-[6px] border border-gray-200 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Profile Image</p>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Choose a profile image from one of your autographs.
        </p>

        {avatarOptions && avatarOptions.length > 0 ? (
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {avatarOptions.map((option: any) => {
              const isSelected = option.id === (profile as any)?.profile_avatar_autograph_id;
              return (
                <form key={option.id} action={updateProfileAvatarAction}>
                  <input type="hidden" name="autograph_id" value={option.id} />
                  <button
                    type="submit"
                    className={`w-full overflow-hidden rounded-[4px] border transition-colors ${
                      isSelected ? 'border-[#001B5C]' : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {option.thumbnail_url ? (
                      <img
                        src={option.thumbnail_url}
                        alt={profile?.display_name ?? displayName}
                        className="aspect-[3/5] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[3/5] w-full items-center justify-center bg-[#1C1C1F] text-[9px] font-bold uppercase tracking-widest text-white/40">
                        —
                      </div>
                    )}
                  </button>
                  {isSelected && (
                    <div className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#001B5C]">
                      Active
                    </div>
                  )}
                </form>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">
            No autographs available yet to use as a profile image.
          </p>
        )}

        {(profile as any)?.profile_avatar_autograph_id ? (
          <form action={updateProfileAvatarAction} className="mt-4">
            <button
              type="submit"
              className="w-full rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
            >
              Clear Profile Image
            </button>
          </form>
        ) : null}
      </div>

      {/* Creator Verification */}
      <div className="mb-4 rounded-[6px] border border-gray-200 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Creator Verification</p>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Creator verification and autograph minting are handled in the Ophinia mobile app.
        </p>
      </div>

      {/* Sign Out */}
      <form action="/logout" method="post" className="mb-3">
        <button
          type="submit"
          className="w-full rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
        >
          Sign Out
        </button>
      </form>

      {/* Legal links */}
      <div className="flex items-center justify-center gap-4 pt-2 text-xs text-gray-400">
        <Link href="/privacy" className="hover:text-black">Privacy Policy</Link>
        <span>·</span>
        <Link href="/terms" className="hover:text-black">Terms of Service</Link>
        <span>·</span>
        <a href="mailto:hello@ophinia.com" className="hover:text-black">Contact Support</a>
      </div>
    </div>
  );
}

function AccountRow({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-5 py-4 ${
        isLast ? '' : 'border-b border-gray-100'
      }`}
    >
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-black">{value}</span>
    </div>
  );
}

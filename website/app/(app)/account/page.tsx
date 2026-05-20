import { updateDisplayNameAction, updateInstagramAction, updatePersonalizedSettingsAction, updateProfileAvatarAction, useVerifiedNameAction } from './actions';
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

function formatInstagramStatus(value?: string | null, handle?: string | null) {
  if (!handle) return 'Not Linked';
  if (value === 'verified') return 'Verified';
  return 'Connected';
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
      profile_avatar_autograph_id,
      role,
      verification_status,
      instagram_handle,
      instagram_status,
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
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-col items-center text-center">
        {(profile as any)?.avatar_url ? (
          <img
            src={(profile as any).avatar_url}
            alt={profile?.display_name ?? user.display_name}
            className="h-24 w-24 rounded-full object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#001B5C] text-3xl font-black text-white shadow-sm">
            {(profile?.display_name ?? user.display_name).slice(0, 1).toUpperCase()}
          </div>
        )}
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
          Account
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
          {profile?.display_name ?? user.display_name}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-gray-600">
          Update your public Ophinia identity on the web. Creator verification and minting remain app-first for now.
        </p>
        <form action="/logout" method="post" className="mt-6">
          <button
            type="submit"
            className="rounded-xl border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
          >
            Sign Out
          </button>
        </form>
      </div>

      {status ? (
        <div
          className={`mt-8 rounded-2xl px-5 py-4 text-sm font-medium ${
            status.includes('error') || status.includes('missing')
              ? 'bg-[#FDECEC] text-[#B3261E]'
              : 'bg-[#EFF6EC] text-[#2B6A1C]'
          }`}
        >
          {status === 'verified_name_saved' && 'Verified name applied. Your badge is now active.'}
          {status === 'name_saved' && 'Display name updated.'}
          {status === 'instagram_saved' && 'Instagram handle saved.'}
          {status === 'instagram_removed' && 'Instagram handle removed.'}
          {status === 'avatar_saved' && 'Profile image updated.'}
          {status === 'avatar_cleared' && 'Profile image cleared.'}
          {status === 'personalized_saved' && 'Personalized requests enabled.'}
          {status === 'personalized_disabled' && 'Personalized requests disabled.'}
          {status === 'name_missing' && 'Please enter a display name.'}
          {status === 'name_error' && 'Could not save your display name. Please try again.'}
          {status === 'instagram_error' && 'Could not save your Instagram handle. Please try again.'}
          {status === 'avatar_error' && 'Could not update your profile image. Please try again.'}
          {status === 'personalized_error' && 'Could not save personalized request settings. Please check the minimum price and try again.'}
        </div>
      ) : null}

      <div className="mt-8 space-y-6">
        <section className="rounded-[2rem] bg-white p-7 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Account Details
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <DetailCard label="Email" value={user.email ?? '—'} />
            <DetailCard label="Status" value={profile?.role === 'verified' ? 'Verified' : 'Member'} />
            <DetailCard label="Verification" value={formatVerificationState(profile?.verification_status)} />
            <DetailCard label="Instagram" value={formatInstagramStatus((profile as any)?.instagram_status, (profile as any)?.instagram_handle)} />
            <DetailCard label="Member Since" value={memberSince} />
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-7 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Personalized Requests
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Let collectors request private custom autographs directly from your profile. Verified creators can set a minimum personalized request price.
          </p>
          {profile?.role === 'verified' ? (
            <form action={updatePersonalizedSettingsAction} className="mt-5 space-y-4">
              <label className="flex items-center justify-between rounded-xl bg-[#F7F7F8] px-4 py-4 text-sm font-medium text-black">
                <span>Enable personalized autograph requests</span>
                <input
                  type="checkbox"
                  name="personalized_requests_enabled"
                  defaultChecked={!!(profile as any)?.personalized_requests_enabled}
                  className="h-5 w-5 accent-[#001B5C]"
                />
              </label>
              <div className="flex items-center rounded-xl border border-transparent bg-[#F7F7F8] px-4 py-4 focus-within:border-[#001B5C] focus-within:bg-white">
                <span className="mr-2 text-base font-semibold text-gray-500">$</span>
                <input
                  type="number"
                  name="personalized_min_price"
                  min="1"
                  step="0.01"
                  defaultValue={
                    (profile as any)?.personalized_min_price_cents
                      ? ((profile as any).personalized_min_price_cents / 100).toFixed(2)
                      : '10.00'
                  }
                  className="w-full bg-transparent text-base text-black outline-none placeholder:text-[#999]"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-[#001B5C] px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-[#00144A]"
              >
                Save Personalized Settings
              </button>
            </form>
          ) : (
            <p className="mt-5 text-sm leading-6 text-gray-600">
              Personalized autograph requests are available once your Ophinia creator account is verified.
            </p>
          )}
        </section>

        {(profile as any)?.validated_name ? (
          <section className="rounded-[2rem] bg-white p-7 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Verified Name Badge
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Your identity was verified as <span className="font-semibold text-black">{(profile as any).validated_name}</span>. Using your verified name displays a badge on your autograph cards, letting collectors confirm your identity.
            </p>
            {(profile as any)?.name_verified ? (
              <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#EFF6EC] px-4 py-4">
                <span className="text-lg">✓</span>
                <div>
                  <p className="text-sm font-semibold text-[#2B6A1C]">Badge active</p>
                  <p className="text-xs text-[#2B6A1C]">Your display name matches your verified name. The badge is showing on your cards.</p>
                </div>
              </div>
            ) : (
              <form action={useVerifiedNameAction} className="mt-5">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#001B5C] px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-[#00144a]"
                >
                  Use verified name &amp; show badge
                </button>
                <p className="mt-3 text-xs text-gray-500">Your current display name will be replaced with your government-verified name. You can switch back to a custom name at any time — the badge will hide until you switch back.</p>
              </form>
            )}
          </section>
        ) : null}

        <section className="rounded-[2rem] bg-white p-7 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Display Name
          </p>
          <form action={updateDisplayNameAction} className="mt-5 space-y-4">
            <input
              type="text"
              name="display_name"
              defaultValue={profile?.display_name ?? user.display_name}
              placeholder="Display name"
              className="w-full rounded-xl border border-transparent bg-[#F7F7F8] px-4 py-4 text-base text-black outline-none transition-colors placeholder:text-[#999] focus:border-[#001B5C] focus:bg-white"
              required
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-[#001B5C] px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-[#00144A]"
            >
              Save Name
            </button>
          </form>
        </section>

        <section className="rounded-[2rem] bg-white p-7 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Instagram
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Add your Instagram handle to show a linked social profile on your Ophinia account.
          </p>
          <form action={updateInstagramAction} className="mt-5 space-y-4">
            <div className="flex items-center rounded-xl border border-transparent bg-[#F7F7F8] px-4 py-4 focus-within:border-[#001B5C] focus-within:bg-white">
              <span className="mr-2 text-base font-semibold text-gray-500">@</span>
              <input
                type="text"
                name="instagram_handle"
                defaultValue={(profile as any)?.instagram_handle ?? ''}
                placeholder="your_handle"
                className="w-full bg-transparent text-base text-black outline-none placeholder:text-[#999]"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-[#001B5C] px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-[#00144A]"
            >
              Save Instagram
            </button>
          </form>
        </section>

        <section className="rounded-[2rem] bg-white p-7 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Profile Image
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Choose a profile image from one of your active autographs.
          </p>

          {avatarOptions && avatarOptions.length > 0 ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {avatarOptions.map((option: any) => {
                const isSelected = option.id === (profile as any)?.profile_avatar_autograph_id;
                return (
                  <form
                    key={option.id}
                    action={updateProfileAvatarAction}
                    className={`rounded-[1.5rem] border p-4 transition-colors ${
                      isSelected ? 'border-[#001B5C] bg-[#F3F6FF]' : 'border-gray-200 bg-[#F7F7F8]'
                    }`}
                  >
                    <input type="hidden" name="autograph_id" value={option.id} />
                    {option.thumbnail_url ? (
                      <img
                        src={option.thumbnail_url}
                        alt={profile?.display_name ?? user.display_name}
                        className="aspect-[4/5] w-full rounded-[1.1rem] object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/5] w-full items-center justify-center rounded-[1.1rem] bg-[#1C1C1F] text-sm font-semibold uppercase tracking-[0.25em] text-white/50">
                        Ophinia
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-black">
                        {option.creator_sequence_number != null ? `#${option.creator_sequence_number}` : 'Autograph'}
                      </div>
                      <button
                        type="submit"
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                          isSelected
                            ? 'bg-[#001B5C] text-white'
                            : 'border border-black text-black hover:bg-black hover:text-white'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Use'}
                      </button>
                    </div>
                  </form>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 text-sm text-gray-600">
              You do not have any active autographs available to use as a profile image yet.
            </p>
          )}

          {(profile as any)?.profile_avatar_autograph_id ? (
            <form action={updateProfileAvatarAction} className="mt-5">
              <button
                type="submit"
                className="w-full rounded-xl border border-black px-5 py-4 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
              >
                Clear Profile Image
              </button>
            </form>
          ) : null}
        </section>

        <section className="rounded-[2rem] bg-white p-7 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Creator Verification
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Ophinia creator verification and autograph minting are still handled in the mobile app. Use the web for profile, browsing, offers, checkout, and collection management.
          </p>
        </section>
      </div>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#F7F7F8] px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-black">{value}</div>
    </div>
  );
}

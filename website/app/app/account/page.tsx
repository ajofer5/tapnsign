import { updateDisplayNameAction, updateInstagramAction, updateProfileAvatarAction } from './actions';
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
      avatar_url,
      profile_avatar_autograph_id,
      role,
      verification_status,
      instagram_handle,
      instagram_status,
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
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Account
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
            Manage your profile
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-gray-600">
            Update your public TapnSign identity on the web. Creator verification and minting remain app-first for now.
          </p>
        </div>
        <form action="/logout" method="post">
          <button
            type="submit"
            className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
          >
            Sign Out
          </button>
        </form>
      </div>

      {status ? (
        <div
          className={`mt-6 rounded-2xl px-5 py-4 text-sm font-medium ${
            status.includes('error') || status.includes('missing')
              ? 'bg-[#FDECEC] text-[#B3261E]'
              : 'bg-[#EFF6EC] text-[#2B6A1C]'
          }`}
        >
          {status === 'name_saved' && 'Display name updated.'}
          {status === 'instagram_saved' && 'Instagram handle saved.'}
          {status === 'instagram_removed' && 'Instagram handle removed.'}
          {status === 'avatar_saved' && 'Profile image updated.'}
          {status === 'avatar_cleared' && 'Profile image cleared.'}
          {status === 'name_missing' && 'Please enter a display name.'}
          {status === 'name_error' && 'Could not save your display name. Please try again.'}
          {status === 'instagram_error' && 'Could not save your Instagram handle. Please try again.'}
          {status === 'avatar_error' && 'Could not update your profile image. Please try again.'}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Account Details
          </p>
          <div className="mt-6 space-y-4 text-sm text-gray-700">
            <Detail label="Name" value={profile?.display_name ?? user.display_name} />
            <Detail label="Email" value={user.email ?? '—'} />
            <Detail label="Status" value={profile?.role === 'verified' ? 'Verified' : 'Member'} />
            <Detail label="Verification State" value={formatVerificationState(profile?.verification_status)} />
            <Detail label="Instagram Status" value={formatInstagramStatus((profile as any)?.instagram_status, (profile as any)?.instagram_handle)} />
            <Detail label="Member Since" value={memberSince} />
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-[2rem] bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Profile Image
            </p>
            <div className="mt-6 flex items-start gap-5">
              {(profile as any)?.avatar_url ? (
                <img
                  src={(profile as any).avatar_url}
                  alt={profile?.display_name ?? user.display_name}
                  className="h-24 w-24 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#E53935] text-3xl font-black text-white">
                  {(profile?.display_name ?? user.display_name).slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="max-w-xl text-base leading-7 text-gray-600">
                Choose a profile image from your own active autographs. This uses the same avatar model as the TapnSign app.
              </div>
            </div>

            {avatarOptions && avatarOptions.length > 0 ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {avatarOptions.map((option: any) => {
                  const isSelected = option.id === (profile as any)?.profile_avatar_autograph_id;
                  return (
                    <form key={option.id} action={updateProfileAvatarAction} className="rounded-[1.5rem] border border-gray-200 bg-[#F6F6F7] p-4">
                      <input type="hidden" name="autograph_id" value={option.id} />
                      {option.thumbnail_url ? (
                        <img
                          src={option.thumbnail_url}
                          alt={profile?.display_name ?? user.display_name}
                          className="aspect-[4/5] w-full rounded-[1.1rem] object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[4/5] w-full items-center justify-center rounded-[1.1rem] bg-[#1C1C1F] text-sm font-semibold uppercase tracking-[0.25em] text-white/50">
                          TapnSign
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-black">
                          {option.creator_sequence_number != null ? `#${option.creator_sequence_number}` : 'Autograph'}
                        </div>
                        <button
                          type="submit"
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                            isSelected
                              ? 'bg-black text-white'
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
              <p className="mt-6 text-sm text-gray-600">
                You do not have any active autographs available to use as a profile image yet.
              </p>
            )}

            {(profile as any)?.profile_avatar_autograph_id ? (
              <form action={updateProfileAvatarAction} className="mt-5">
                <button
                  type="submit"
                  className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
                >
                  Clear Profile Image
                </button>
              </form>
            ) : null}
          </div>

          <div className="rounded-[2rem] bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Display Name
            </p>
            <form action={updateDisplayNameAction} className="mt-6 space-y-4">
              <label className="block">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Public Name
                </div>
                <input
                  type="text"
                  name="display_name"
                  defaultValue={profile?.display_name ?? user.display_name}
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base text-black outline-none transition-colors placeholder:text-gray-400 focus:border-black"
                  required
                />
              </label>
              <button
                type="submit"
                className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
              >
                Save Name
              </button>
            </form>
          </div>

          <div className="rounded-[2rem] bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Instagram
            </p>
            <p className="mt-3 text-base leading-7 text-gray-600">
              Add your Instagram handle to show a linked social profile on your TapnSign account.
            </p>
            <form action={updateInstagramAction} className="mt-6 space-y-4">
              <label className="block">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Instagram Handle
                </div>
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-4">
                  <span className="text-base font-semibold text-gray-500">@</span>
                  <input
                    type="text"
                    name="instagram_handle"
                    defaultValue={(profile as any)?.instagram_handle ?? ''}
                    placeholder="your_handle"
                    className="w-full bg-transparent text-base text-black outline-none placeholder:text-gray-400"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
                >
                  Save Instagram
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-[2rem] bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Creator Verification
            </p>
            <p className="mt-3 text-base leading-7 text-gray-600">
              TapnSign creator verification and autograph minting are still handled in the mobile app. Use the web for profile, browsing, offers, checkout, and collection management.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-3">
      <span className="text-gray-500">{label}</span>
      <span className="max-w-[62%] text-right font-medium text-black">{value}</span>
    </div>
  );
}

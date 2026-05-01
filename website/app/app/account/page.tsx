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
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-col items-center text-center">
        {(profile as any)?.avatar_url ? (
          <img
            src={(profile as any).avatar_url}
            alt={profile?.display_name ?? user.display_name}
            className="h-24 w-24 rounded-full object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#E53935] text-3xl font-black text-white shadow-sm">
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
          Update your public TapnSign identity on the web. Creator verification and minting remain app-first for now.
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
            Display Name
          </p>
          <form action={updateDisplayNameAction} className="mt-5 space-y-4">
            <input
              type="text"
              name="display_name"
              defaultValue={profile?.display_name ?? user.display_name}
              placeholder="Display name"
              className="w-full rounded-xl border border-transparent bg-[#F7F7F8] px-4 py-4 text-base text-black outline-none transition-colors placeholder:text-[#999] focus:border-[#E53935] focus:bg-white"
              required
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-[#E53935] px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-[#cf302d]"
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
            Add your Instagram handle to show a linked social profile on your TapnSign account.
          </p>
          <form action={updateInstagramAction} className="mt-5 space-y-4">
            <div className="flex items-center rounded-xl border border-transparent bg-[#F7F7F8] px-4 py-4 focus-within:border-[#E53935] focus-within:bg-white">
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
              className="w-full rounded-xl bg-[#E53935] px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-[#cf302d]"
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
                      isSelected ? 'border-[#E53935] bg-[#FFF5F5]' : 'border-gray-200 bg-[#F7F7F8]'
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
                        TapnSign
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
                            ? 'bg-[#E53935] text-white'
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
            TapnSign creator verification and autograph minting are still handled in the mobile app. Use the web for profile, browsing, offers, checkout, and collection management.
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

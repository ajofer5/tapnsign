import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WebListingCard } from '../../../components/web-listing-card';
import { getWebsiteProfile } from '../../../lib/profile';
import { getWebSessionUser } from '../../../lib/web-auth';
import { getSavedAutographIds } from '../../../lib/watchlist';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getWebsiteProfile(id);
  if (!profile) notFound();
  const user = await getWebSessionUser();
  const savedIds = user
    ? await getSavedAutographIds(user.id, profile.active_listings.map((listing) => listing.id))
    : new Set<string>();
  const hasCreatedAutographs = (profile.stats.autographs_signed ?? 0) > 0;
  const profileStatusLabel = hasCreatedAutographs ? 'Creator / Collector' : 'Collector';
  const verificationLabel = profile.verified ? 'Verified' : 'Member';

  return (
    <main className="min-h-screen bg-[#F2F2F4]">
      <nav className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
          <Link href="/" className="text-lg font-black text-[#E53935]">
            TapnSign
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/marketplace" className="text-sm text-gray-500 hover:text-black">
              Marketplace
            </Link>
            {user ? (
              <Link href="/app" className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
                My App
              </Link>
            ) : (
              <Link href={`/login?next=${encodeURIComponent(`/profile/${id}`)}`} className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <section className="rounded-[2rem] bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-5">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="h-24 w-24 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#E53935] text-3xl font-black text-white">
                  {profile.display_name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="max-w-2xl">
                <h1 className="text-4xl font-black tracking-tight text-black">
                  {profile.display_name}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  {profile.verified ? (
                    <span className="rounded-full bg-[#EFF6EC] px-3 py-1 font-semibold text-[#2B6A1C]">
                      Verified by TapnSign
                    </span>
                  ) : null}
                  <span className="rounded-full bg-[#F6F6F7] px-3 py-1 font-semibold text-gray-700">
                    {profileStatusLabel}
                  </span>
                  {profile.instagram_handle ? (
                    <a
                      href={`https://instagram.com/${profile.instagram_handle}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[#E1306C]"
                    >
                      @{profile.instagram_handle}
                    </a>
                  ) : null}
                </div>
                <p className="mt-4 text-base leading-7 text-gray-600">
                  TapnSign {verificationLabel.toLowerCase()} member since {formatDate(profile.member_since)}.
                  {profile.creator_since ? ` Creator since ${formatDate(profile.creator_since)}.` : ''}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:min-w-[360px]">
              <Stat label="Listings" value={String(profile.active_listings.length ?? 0)} />
              <Stat label="Signed" value={String(profile.stats.autographs_signed ?? 0)} />
              <Stat label="Series" value={String(profile.stats.unique_series_signed ?? 0)} />
              <Stat label="Owned" value={String(profile.stats.autographs_owned ?? 0)} />
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Profile Details
            </p>
            <div className="mt-6 space-y-4 text-sm text-gray-700">
              <Detail label="Verification" value={verificationLabel} />
              <Detail label="Member Since" value={formatDate(profile.member_since)} />
              <Detail label="Creator Since" value={formatDate(profile.creator_since)} />
              <Detail label="Autographs Created" value={String(profile.stats.autographs_signed ?? 0)} />
              <Detail label="Series Created" value={String(profile.stats.unique_series_signed ?? 0)} />
              <Detail label="Autographs Owned" value={String(profile.stats.autographs_owned ?? 0)} />
              <Detail label="Unique Creators Collected" value={String(profile.stats.unique_creators ?? 0)} />
              <Detail label="Unique Series Collected" value={String(profile.stats.unique_series_owned ?? 0)} />
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Trust
            </p>
            <h2 className="mt-3 text-2xl font-black text-black">
              Verified digital autograph profile
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              Use this page to confirm who the creator is, review their current listings, and continue into certificate, offer, or checkout flows on the web.
            </p>
            <div className="mt-6 space-y-3 text-sm text-gray-700">
              <TrustRow label="TapnSign Status" value={profileStatusLabel} />
              <TrustRow label="Verification" value={profile.verified ? 'Verified by TapnSign' : 'Member account'} />
              <TrustRow label="Instagram" value={profile.instagram_handle ? `@${profile.instagram_handle}` : 'Not linked'} />
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-black text-black">Listings</h2>
            <span className="text-sm text-gray-500">
              {profile.active_listings.length} current listing{profile.active_listings.length !== 1 ? 's' : ''}
            </span>
          </div>

          {profile.active_listings.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {profile.active_listings.map((listing) => (
                <WebListingCard
                  key={listing.id}
                  listing={listing}
                  isSaved={savedIds.has(listing.id)}
                  savePath={`/profile/${id}`}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[2rem] bg-white p-10 text-center shadow-sm">
              <h3 className="text-2xl font-black text-black">No current listings</h3>
              <p className="mt-3 text-base text-gray-600">
                This creator does not have any public listings available right now.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] bg-[#F6F6F7] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</div>
      <div className="mt-2 text-lg font-black text-black">{value}</div>
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

function TrustRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[1.25rem] bg-[#F6F6F7] px-4 py-3">
      <span className="text-gray-500">{label}</span>
      <span className="max-w-[62%] text-right font-medium text-black">{value}</span>
    </div>
  );
}

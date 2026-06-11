import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { WebListingCard } from '../../../components/web-listing-card';
import { getWebsiteProfile } from '../../../lib/profile';
import { getWebSessionUser } from '../../../lib/web-auth';
import { getSavedAutographIds } from '../../../lib/watchlist';
import {
  webRouteToProfile,
  webRoutes,
  withNext,
} from '../../../lib/routes';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getWebsiteProfile(id);
  if (!profile) notFound();
  const user = await getWebSessionUser();
  const savedIds = user
    ? await getSavedAutographIds(user.id, profile.active_listings.map((listing) => listing.id))
    : new Set<string>();
  const hasCreatedAutographs = (profile.stats.autographs_signed ?? 0) > 0;
  const profileStatusLabel = hasCreatedAutographs ? 'Creator' : 'Collector';

  return (
    <main className="min-h-screen bg-[#F2F2F4]">
      <nav className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
          <Link href={webRoutes.landing}>
            <Image src="/ophinia-logo.png" alt="Ophinia" width={120} height={32} className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-4">
            <Link href={webRoutes.marketplace} className="text-sm text-gray-500 hover:text-black">
              Marketplace
            </Link>
            {user ? (
              <Link href={webRoutes.home} className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
                My App
              </Link>
            ) : (
              <Link href={withNext(webRoutes.login, webRouteToProfile(id))} className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Profile header */}
        <section className="web-panel p-8">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-5">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="h-40 w-24 rounded-none object-cover"
                />
              ) : (
                <div className="flex h-40 w-24 items-center justify-center rounded-none bg-[#001B5C] text-3xl font-black text-white">
                  {profile.display_name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
                  Public Profile
                </p>
                <h1 className="mt-2 text-4xl font-black tracking-tight text-black">
                  {profile.display_name}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                  {profile.verified ? (
                    <span className="rounded-[4px] bg-[#EFF6EC] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2B6A1C]">
                      Verified
                    </span>
                  ) : null}
                  <span className="rounded-[4px] bg-[#F6F6F7] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-700">
                    {profileStatusLabel}
                  </span>
                </div>
                {profile.bio ? (
                  <p className="mt-4 max-w-xl text-sm leading-7 text-gray-700 md:text-base">
                    {profile.bio}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:min-w-[200px]">
              <Stat label="Signed" value={String(profile.stats.autographs_signed ?? 0)} />
              <Stat label="Public Prints" value={String(profile.active_listings.length ?? 0)} />
            </div>
          </div>
        </section>

        {/* Download CTA */}
        <section className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-[#001B5C] px-8 py-7 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-base font-black text-white">Get the Ophinia app</p>
            <p className="mt-1 text-sm text-blue-200">
              Collect verified digital autographs and order official 8×10 prints.
            </p>
          </div>
          <Link
            href={webRoutes.landing}
            className="shrink-0 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-[#001B5C] transition-colors hover:bg-blue-50"
          >
            Download Free
          </Link>
        </section>

        {/* Official Prints */}
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-black text-black">Official Prints</h2>
            <span className="text-sm text-gray-500">
              {profile.active_listings.length} public print{profile.active_listings.length !== 1 ? 's' : ''}
            </span>
          </div>

          {profile.active_listings.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {profile.active_listings.map((listing) => (
                <WebListingCard
                  key={listing.id}
                  listing={listing}
                  isSaved={savedIds.has(listing.id)}
                  savePath={webRouteToProfile(id)}
                />
              ))}
            </div>
          ) : (
            <div className="web-panel p-10 text-center">
              <h3 className="text-2xl font-black text-black">No public prints yet</h3>
              <p className="mt-3 text-base text-gray-600">
                This creator does not have any public prints available right now.
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
    <div className="rounded-[6px] border border-gray-200 bg-[#F8F8F9] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</div>
      <div className="mt-2 text-lg font-black leading-none text-black">{value}</div>
    </div>
  );
}

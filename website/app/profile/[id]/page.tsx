import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SaveCreatorButton } from '../../../components/save-creator-button';
import { ProfilePrintGrid } from '../../../components/profile-print-grid';
import { PublicNav } from '../../../components/public-nav';
import { getWebsiteProfile } from '../../../lib/profile';
import { getWebSessionUser } from '../../../lib/web-auth';
import { getSavedAutographIds, getIsCreatorSaved } from '../../../lib/watchlist';
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
  const isOwnProfile = user?.id === id;
  const [savedIds, isCreatorSaved] = await Promise.all([
    user ? getSavedAutographIds(user.id, profile.active_listings.map((l) => l.id)) : Promise.resolve(new Set<string>()),
    user && !isOwnProfile ? getIsCreatorSaved(user.id, id) : Promise.resolve(false),
  ]);

  return (
    <main className="min-h-screen bg-[#F2F2F4]">
      <PublicNav user={user} returnPath={webRouteToProfile(id)} />

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Profile header */}
        <section className="rounded-none bg-white p-5 shadow-sm">
          <div className="flex items-start gap-5">
            <div className="flex shrink-0 flex-col items-center gap-2">
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
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-2xl font-black tracking-tight text-black">
                {profile.display_name}
              </h1>
              {profile.bio ? (
                <p className="mt-3 break-words text-sm leading-7 text-gray-700 md:text-base">
                  {profile.bio}
                </p>
              ) : null}
              {!isOwnProfile && (
                <SaveCreatorButton
                  creatorId={id}
                  initialSaved={isCreatorSaved}
                  loginPath={withNext(webRoutes.login, webRouteToProfile(id))}
                />
              )}
            </div>
          </div>
        </section>

        {/* Official Prints */}
        <section className="mt-8">
          <h2 className="mb-4 text-2xl font-black text-black">Official Prints</h2>

          {profile.active_listings.length > 0 ? (
            <ProfilePrintGrid
              listings={profile.active_listings}
              savedIds={Array.from(savedIds)}
              savePath={webRouteToProfile(id)}
            />
          ) : (
            <div className="web-panel p-10 text-center">
              <h3 className="text-2xl font-black text-black">No public prints yet</h3>
              <p className="mt-3 text-base text-gray-600">
                This creator does not have any public prints available right now.
              </p>
            </div>
          )}
        </section>

        {/* Download CTA */}
        <section className="mt-8 flex flex-col items-center gap-3 rounded-2xl bg-[#001B5C] px-8 py-7 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-base font-black text-white">Get the Ophinia app</p>
            <p className="mt-1 text-sm text-blue-200">
              Collect official moments and order 8×10 prints.
            </p>
          </div>
          <Link
            href={webRoutes.landing}
            className="shrink-0 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-[#001B5C] transition-colors hover:bg-blue-50"
          >
            Download Free
          </Link>
        </section>
      </div>
    </main>
  );
}

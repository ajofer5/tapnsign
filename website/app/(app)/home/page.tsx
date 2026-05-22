import Image from 'next/image';
import Link from 'next/link';
import { getWebsiteProfile } from '../../../lib/profile';
import { webRouteToProfile, webRoutes } from '../../../lib/routes';
import { getWebSessionUser } from '../../../lib/web-auth';

export const dynamic = 'force-dynamic';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function WebAppHomePage() {
  const user = await getWebSessionUser();
  const profile = user?.id ? await getWebsiteProfile(user.id) : null;

  const displayName = profile?.display_name ?? user?.display_name ?? 'Ophinia Member';
  const avatarUrl = profile?.avatar_url ?? null;
  const isVerified = profile?.verified ?? user?.verification_status === 'verified';
  const hasCreatedAutographs = (profile?.stats.autographs_signed ?? 0) > 0;
  const profileStatusLabel = hasCreatedAutographs ? 'Creator' : 'Collector';

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <section className="web-panel p-8">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-5">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-40 w-24 rounded-[6px] object-cover"
              />
            ) : (
              <div className="flex h-40 w-24 items-center justify-center rounded-[6px] bg-[#001B5C] text-3xl font-black text-white">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
                My Profile
              </p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-black">
                {displayName}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                {isVerified ? (
                  <span className="rounded-[4px] bg-[#EFF6EC] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2B6A1C]">
                    Verified
                  </span>
                ) : null}
                <span className="rounded-[4px] bg-[#F6F6F7] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-700">
                  {profileStatusLabel}
                </span>
                {profile?.instagram_handle ? (
                  <a
                    href={`https://instagram.com/${profile.instagram_handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] font-semibold text-[#001B5C] hover:text-black"
                  >
                    @{profile.instagram_handle}
                  </a>
                ) : null}
              </div>
              <p className="mt-4 max-w-xl text-sm leading-7 text-gray-600 md:text-base">
                Member since {formatDate(profile?.member_since)}
                {profile?.creator_since ? ` · Creating on Ophinia since ${formatDate(profile.creator_since)}` : ''}
                .
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
            <Stat label="Listings" value={String(profile?.active_listings.length ?? 0)} />
            <Stat label="Signed" value={String(profile?.stats.autographs_signed ?? 0)} />
            <Stat label="Series" value={String(profile?.stats.unique_series_signed ?? 0)} />
            <Stat label="Owned" value={String(profile?.stats.autographs_owned ?? 0)} />
          </div>
        </div>
      </section>

      <section className="web-panel mt-8 p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Quick Actions
            </p>
            <p className="mt-2 text-sm leading-7 text-gray-600">
              Review your public profile, manage your collection, and keep offers moving.
            </p>
          </div>
          {user?.id ? (
            <Link
              href={webRouteToProfile(user.id)}
              className="inline-flex items-center justify-center rounded-lg bg-[#001B5C] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#00144A]"
            >
              View My Public Profile
            </Link>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QuickLink href={webRoutes.collection} label="Collection" />
          <QuickLink href={webRoutes.marketplace} label="Marketplace" tone="primary" />
          <QuickLink href={webRoutes.saved} label="Saved" />
          <QuickLink href={webRoutes.myListings} label="My Listings" />
          <QuickLink href={webRoutes.myOffers} label="Offer Queue" />
          <QuickLink href={webRoutes.activity} label="Activity" />
        </div>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <FeatureCard
          icon="profile"
          title="Public Profile Preview"
          body="Use your Home tab as a quick check on how your identity and stats read before someone opens your profile link."
        />
        <FeatureCard
          icon="collection"
          title="Collection First"
          body="Move between owned autographs, live listings, and saved items without the old dashboard filler."
        />
      </section>
    </div>
  );
}

function QuickLink({
  href,
  label,
  tone = 'default',
}: {
  href: string;
  label: string;
  tone?: 'default' | 'primary';
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-5 py-4 text-sm font-semibold transition-colors ${
        tone === 'primary'
          ? 'bg-[#001B5C] text-white hover:bg-[#00144A]'
          : 'border border-gray-200 bg-[#F7F7F8] text-black hover:border-black hover:bg-white'
      }`}
    >
      {label}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] bg-[#F7F7F8] px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</div>
      <div className="mt-2 text-xl font-black text-black">{value}</div>
    </div>
  );
}

function FeatureCard({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: 'profile' | 'collection';
}) {
  return (
    <div className="web-panel-tight p-7">
      <div className="flex items-center gap-3">
        <Image
          src={icon === 'profile' ? '/mark.png' : '/ophinia-badge.png'}
          alt=""
          width={20}
          height={20}
          className="h-5 w-5"
        />
        <h2 className="text-xl font-black text-black">{title}</h2>
      </div>
      <p className="mt-3 text-base leading-7 text-gray-600">{body}</p>
    </div>
  );
}

import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { WebListingCard } from '../../../components/web-listing-card';
import { getWebsiteProfile } from '../../../lib/profile';
import { getWebSessionUser } from '../../../lib/web-auth';
import { getSavedAutographIds } from '../../../lib/watchlist';
import {
  webRouteToProfile,
  webRouteToProfilePersonalizedRequestStart,
  webRoutes,
  withNext,
} from '../../../lib/routes';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ request_status?: string; request_error?: string; request_canceled?: string }>;
}) {
  const { id } = await params;
  const profile = await getWebsiteProfile(id);
  if (!profile) notFound();
  const resolvedSearch = await searchParams;
  const user = await getWebSessionUser();
  const savedIds = user
    ? await getSavedAutographIds(user.id, profile.active_listings.map((listing) => listing.id))
    : new Set<string>();
  const hasCreatedAutographs = (profile.stats.autographs_signed ?? 0) > 0;
  const profileStatusLabel = hasCreatedAutographs ? 'Creator' : 'Collector';
  const verificationLabel = profile.verified ? 'Verified' : 'Member';
  const canRequestPersonalized =
    !!user &&
    user.id !== id &&
    profile.verified &&
    profile.personalized_requests_enabled;
  const requestSent = resolvedSearch?.request_status === 'sent';

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
                  {profile.instagram_handle ? (
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
                  {verificationLabel} member since {formatDate(profile.member_since)}
                  {profile.creator_since ? ` · Creating on Ophinia since ${formatDate(profile.creator_since)}` : ''}
                  .
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
              <Stat label="Listings" value={String(profile.active_listings.length ?? 0)} />
              <Stat label="Signed" value={String(profile.stats.autographs_signed ?? 0)} />
              <Stat label="Series" value={String(profile.stats.unique_series_signed ?? 0)} />
              <Stat label="Owned" value={String(profile.stats.autographs_owned ?? 0)} />
            </div>
          </div>
        </section>

        {resolvedSearch?.request_status || resolvedSearch?.request_error || resolvedSearch?.request_canceled === '1' ? (
          <div
            className={`mt-8 rounded-lg px-5 py-4 text-sm font-medium ${
              resolvedSearch?.request_error
                ? 'bg-[#FDECEC] text-[#B3261E]'
                : resolvedSearch?.request_canceled === '1'
                  ? 'bg-[#FFF5E5] text-[#8A5A00]'
                  : 'bg-[#EFF6EC] text-[#2B6A1C]'
            }`}
          >
            {resolvedSearch?.request_status === 'sent' && 'Your personalized request was sent and the authorization hold is in place.'}
            {resolvedSearch?.request_canceled === '1' && 'Authorization was canceled before the personalized request was sent.'}
            {resolvedSearch?.request_error && 'Could not authorize and send your personalized request. Please try again.'}
          </div>
        ) : null}

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="web-panel p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Profile Details
            </p>
            <div className="mt-6 space-y-4 text-sm text-gray-700">
              <Detail label="Verification" value={verificationLabel} />
              <Detail label="Member Since" value={formatDate(profile.member_since)} />
              <Detail label="Creator Since" value={formatDate(profile.creator_since)} />
              <Detail label="Autographs Created" value={String(profile.stats.autographs_signed ?? 0)} />
              <Detail label="Autographs Owned" value={String(profile.stats.autographs_owned ?? 0)} />
            </div>
          </div>

          <div className="web-panel p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Quick Trust
            </p>
            <div className="mt-6 space-y-3 text-sm text-gray-700">
              <TrustRow label="Ophinia Status" value={profileStatusLabel} />
              <TrustRow label="Verification" value={profile.verified ? 'Verified by Ophinia' : 'Member account'} />
              <TrustRow label="Instagram" value={profile.instagram_handle ? `@${profile.instagram_handle}` : 'Not linked'} />
              {profile.personalized_requests_enabled ? (
                <TrustRow
                  label="Personalized"
                  value={`Requests from ${formatMoney(profile.personalized_min_price_cents)}`}
                />
              ) : null}
            </div>
          </div>
        </section>

        {canRequestPersonalized && !requestSent ? (
          <section className="web-panel mt-8 p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Personalized Autograph
            </p>
            <h2 className="mt-3 text-2xl font-black text-black">
              Request a private custom autograph
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
              This request stays private between you and the creator. Ophinia places an authorization hold first, then creates the request once payment authorization succeeds.
            </p>
            <div className="mt-4 rounded-[14px] bg-[#F7F7F8] px-5 py-4 text-sm font-medium text-gray-700">
              Minimum request price: {formatMoney(profile.personalized_min_price_cents)}
            </div>
            <form action={webRouteToProfilePersonalizedRequestStart(id)} method="post" className="mt-6 space-y-4">
              <input
                type="text"
                name="recipient_name"
                placeholder="Recipient name"
                className="w-full rounded-lg border border-transparent bg-[#F7F7F8] px-4 py-4 text-base text-black outline-none transition-colors placeholder:text-[#999] focus:border-[#001B5C] focus:bg-white"
                required
              />
              <input
                type="text"
                name="inscription_text"
                placeholder="Optional inscription"
                className="w-full rounded-lg border border-transparent bg-[#F7F7F8] px-4 py-4 text-base text-black outline-none transition-colors placeholder:text-[#999] focus:border-[#001B5C] focus:bg-white"
              />
              <textarea
                name="requester_note"
                placeholder="Optional note for the creator"
                rows={4}
                className="w-full rounded-lg border border-transparent bg-[#F7F7F8] px-4 py-4 text-base text-black outline-none transition-colors placeholder:text-[#999] focus:border-[#001B5C] focus:bg-white"
              />
              <div className="flex items-center rounded-lg border border-transparent bg-[#F7F7F8] px-4 py-4 focus-within:border-[#001B5C] focus-within:bg-white">
                <span className="mr-2 text-base font-semibold text-gray-500">$</span>
                <input
                  type="text"
                  name="amount"
                  defaultValue={
                    typeof profile.personalized_min_price_cents === 'number'
                      ? (profile.personalized_min_price_cents / 100).toFixed(2)
                      : '10.00'
                  }
                  placeholder="0.00"
                  className="w-full bg-transparent text-base text-black outline-none placeholder:text-[#999]"
                  required
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-[#001B5C] px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-[#00144A]"
              >
                Authorize and Send Request
              </button>
            </form>
          </section>
        ) : canRequestPersonalized && requestSent ? (
          <section className="web-panel mt-8 p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Personalized Autograph
            </p>
            <h2 className="mt-3 text-2xl font-black text-black">
              Request sent successfully
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
              Your authorization hold is in place and the creator can now review the request in Ophinia. You can track updates from Activity and your personalized requests inbox after signing in.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={webRoutes.personalizedRequests}
                className="rounded-lg bg-[#001B5C] px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-[#00144A]"
              >
                View Your Requests
              </Link>
              <Link
                href={webRoutes.activity}
                className="rounded-lg border border-gray-300 px-6 py-4 text-base font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
              >
                Open Activity
              </Link>
            </div>
          </section>
        ) : !user ? (
          <section className="web-panel mt-8 p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Personalized Autograph
            </p>
            <h2 className="mt-3 text-2xl font-black text-black">
              Request a private custom autograph
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
              Sign in to request a personalized autograph from this creator.
            </p>
            <Link
              href={withNext(webRoutes.login, webRouteToProfile(id))}
              className="mt-6 inline-flex rounded-lg bg-[#001B5C] px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-[#00144A]"
            >
              Sign In to Request
            </Link>
          </section>
        ) : null}

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
                  savePath={webRouteToProfile(id)}
                />
              ))}
            </div>
          ) : (
            <div className="web-panel p-10 text-center">
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

function formatMoney(cents?: number | null) {
  if (typeof cents !== 'number') return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] border border-gray-200 bg-[#F8F8F9] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</div>
      <div className="mt-2 text-lg font-black leading-none text-black">{value}</div>
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
    <div className="flex items-start justify-between gap-4 rounded-[12px] bg-[#F6F6F7] px-4 py-3">
      <span className="text-gray-500">{label}</span>
      <span className="max-w-[62%] text-right font-medium text-black">{value}</span>
    </div>
  );
}

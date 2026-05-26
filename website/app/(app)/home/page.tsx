import Link from 'next/link';
import { getMyOfferQueue } from '../../../lib/me';
import { getMyPersonalizedRequests } from '../../../lib/personalized-requests';
import { getWebsiteProfile } from '../../../lib/profile';
import { webRoutes } from '../../../lib/routes';
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

type ActionItem = {
  label: string;
  value: string;
  body: string;
  href: string;
  cta: string;
  tone: 'default' | 'primary';
};

export default async function WebAppHomePage() {
  const user = await getWebSessionUser();
  const profile = user?.id ? await getWebsiteProfile(user.id) : null;
  const [{ groups: offerQueue }, personalizedRequests] = user?.id
    ? await Promise.all([
        getMyOfferQueue(user.id, 12, null),
        getMyPersonalizedRequests(user.id),
      ])
    : [{ groups: [] }, { incoming: [], outgoing: [] }];

  const displayName = profile?.display_name ?? user?.display_name ?? 'Ophinia Member';
  const avatarUrl = profile?.avatar_url ?? null;
  const isVerified = profile?.verified ?? user?.verification_status === 'verified';
  const hasCreatedAutographs = (profile?.stats.autographs_signed ?? 0) > 0;
  const profileStatusLabel = hasCreatedAutographs ? 'Creator' : 'Collector';
  const acceptedOffers = offerQueue.filter((group) => group.accepted);
  const pendingOfferGroups = offerQueue.filter((group) => group.pending.length > 0);
  const incomingPendingRequests = personalizedRequests.incoming.filter((request) => request.status === 'pending');
  const outgoingReadyRequests = personalizedRequests.outgoing.filter(
    (request) => request.status === 'fulfilled' && !request.completed_transfer_id
  );
  const actionItems: ActionItem[] = [];

  if (acceptedOffers.length > 0) {
    actionItems.push({
      label: 'Buyer payment due',
      value: `${acceptedOffers.length} accepted offer${acceptedOffers.length !== 1 ? 's' : ''}`,
      body: 'A buyer has been accepted and backup offers are on hold until payment clears.',
      href: webRoutes.myOffers,
      cta: 'Open Offer Queue',
      tone: 'primary',
    });
  }

  if (pendingOfferGroups.length > 0) {
    actionItems.push({
      label: 'Offers waiting',
      value: `${pendingOfferGroups.length} autograph${pendingOfferGroups.length !== 1 ? 's' : ''}`,
      body: 'Incoming offers are waiting on your accept or decline decision.',
      href: webRoutes.myOffers,
      cta: 'Review Offers',
      tone: 'default',
    });
  }

  if (incomingPendingRequests.length > 0) {
    actionItems.push({
      label: 'Personalized requests',
      value: `${incomingPendingRequests.length} request${incomingPendingRequests.length !== 1 ? 's' : ''}`,
      body: 'Collectors are waiting on your response to private autograph requests.',
      href: webRoutes.personalizedRequests,
      cta: 'Open Requests',
      tone: 'default',
    });
  }

  if (outgoingReadyRequests.length > 0) {
    actionItems.push({
      label: 'Payment ready',
      value: `${outgoingReadyRequests.length} request${outgoingReadyRequests.length !== 1 ? 's' : ''}`,
      body: 'A personalized autograph is ready and waiting for your final payment.',
      href: webRoutes.personalizedRequests,
      cta: 'Complete Payment',
      tone: 'default',
    });
  }

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

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="web-panel-tight p-7 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
                Action Items
              </p>
              <p className="mt-2 text-sm leading-7 text-gray-600">
                Time-sensitive requests, offers, and payment steps that need your attention.
              </p>
            </div>
          </div>

          {actionItems.length > 0 ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {actionItems.map((item) => (
                <ActionItemCard
                  key={`${item.label}-${item.value}`}
                  label={item.label}
                  value={item.value}
                  body={item.body}
                  href={item.href}
                  cta={item.cta}
                  tone={item.tone}
                />
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-[6px] bg-[#F7F7F8] px-5 py-5 text-sm text-gray-600">
              No urgent action items right now. Your offers, personalized requests, and listings are all caught up.
            </div>
          )}
        </div>
      </section>
    </div>
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

function ActionItemCard({
  label,
  value,
  body,
  href,
  cta,
  tone,
}: {
  label: string;
  value: string;
  body: string;
  href: string;
  cta: string;
  tone: 'default' | 'primary';
}) {
  return (
    <div className="rounded-[6px] border border-gray-200 bg-white p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black text-black">{value}</div>
      <p className="mt-3 text-sm leading-7 text-gray-600">{body}</p>
      <Link
        href={href}
        className={`mt-5 inline-flex rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
          tone === 'primary'
            ? 'bg-[#001B5C] text-white hover:bg-[#00144A]'
            : 'border border-gray-300 text-gray-700 hover:border-black hover:text-black'
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

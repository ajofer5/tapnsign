import type { ReactNode } from 'react';
import Link from 'next/link';
import { CollectionPrintsToggle } from '../../../components/collection-prints-toggle';
import { type WebsiteListing } from '../../../lib/listings';
import { getMyListings, type WebsiteMyListing } from '../../../lib/me';
import { webRouteToAutograph } from '../../../lib/routes';
import { requireWebSessionUser } from '../../../lib/web-auth';
import { getSavedCreators, getSavedListings, type WebsiteSavedCreator } from '../../../lib/watchlist';

export const dynamic = 'force-dynamic';

type CollectionTab = 'captured' | 'saved_cards' | 'saved_creators';

const COLLECTION_TABS: { key: CollectionTab; label: string }[] = [
  { key: 'captured', label: 'Captured' },
  { key: 'saved_cards', label: 'Saved Cards' },
  { key: 'saved_creators', label: 'Saved Creators' },
];

type CollectionPageProps = {
  searchParams?: Promise<{
    tab?: string;
    before_created_at?: string;
    before_id?: string;
    before_saved_at?: string;
    before_autograph_id?: string;
    before_creator_id?: string;
  }>;
};

function formatCardDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
}

function formatSeriesEdition(item: {
  series_sequence_number: number | null;
  series_max_size: number | null;
}) {
  if (item.series_sequence_number == null) return null;
  if (item.series_max_size == null) return `#${item.series_sequence_number}`;
  return `${item.series_sequence_number} of ${item.series_max_size}`;
}

function formatSavedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `Saved ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function getActiveTab(value?: string): CollectionTab {
  if (value === 'saved_cards' || value === 'saved_creators') return value;
  return 'captured';
}

function getAutographCreatorName(item: WebsiteMyListing | WebsiteListing) {
  return 'creator_name' in item
    ? item.creator_name
    : item.creator?.display_name ?? 'Creator';
}

function getPaginationHref(tab: CollectionTab, params: Record<string, string>) {
  const query = new URLSearchParams({ tab, ...params });
  return `/collection?${query.toString()}`;
}

export default async function CollectionPage({ searchParams }: CollectionPageProps) {
  const user = await requireWebSessionUser();
  const params = (await searchParams) ?? {};
  const activeTab = getActiveTab(params.tab);

  const capturedCursor =
    activeTab === 'captured' && params.before_created_at && params.before_id
      ? { beforeCreatedAt: params.before_created_at, beforeId: params.before_id }
      : null;
  const savedCardsCursor =
    activeTab === 'saved_cards' && params.before_saved_at && params.before_autograph_id
      ? { beforeSavedAt: params.before_saved_at, beforeAutographId: params.before_autograph_id }
      : null;
  const savedCreatorsCursor =
    activeTab === 'saved_creators' && params.before_saved_at && params.before_creator_id
      ? { beforeSavedAt: params.before_saved_at, beforeCreatorId: params.before_creator_id }
      : null;

  const [
    { listings: capturedAutographs, nextCursor: capturedNextCursor },
    { listings: savedCards, nextCursor: savedCardsNextCursor },
    { creators: savedCreators, nextCursor: savedCreatorsNextCursor },
  ] = await Promise.all([
    activeTab === 'captured'
      ? getMyListings(user.id, 24, capturedCursor)
      : Promise.resolve({ listings: [] as WebsiteMyListing[], nextCursor: null }),
    activeTab === 'saved_cards'
      ? getSavedListings(user.id, 24, savedCardsCursor)
      : Promise.resolve({ listings: [] as WebsiteListing[], nextCursor: null }),
    activeTab === 'saved_creators'
      ? getSavedCreators(user.id, 24, savedCreatorsCursor)
      : Promise.resolve({ creators: [] as WebsiteSavedCreator[], nextCursor: null }),
  ]);

  const visibleCount =
    activeTab === 'captured'
      ? capturedAutographs.length
      : activeTab === 'saved_cards'
        ? savedCards.length
        : savedCreators.length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
            Collection
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-black">
            Your Collection
          </h1>
        </div>
        {visibleCount > 0 ? (
          <div className="text-sm font-medium text-gray-500">
            {visibleCount} item{visibleCount !== 1 ? 's' : ''}
          </div>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-3 rounded-[6px] border border-gray-200 bg-white p-1">
        {COLLECTION_TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.key === 'captured' ? '/collection' : `/collection?tab=${tab.key}`}
              className={[
                'rounded-[4px] px-2 py-2 text-center text-[11px] font-black uppercase tracking-[0.12em] transition-colors',
                active ? 'bg-[#001B5C] text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-black',
              ].join(' ')}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {activeTab === 'captured' && capturedAutographs.length > 0 ? (
        <div className="space-y-3">
          {capturedAutographs.map((item) => {
            const isCreator = item.creator_id === user.id;
            return (
              <AutographRow
                key={item.id}
                item={item}
                action={isCreator ? (
                  <CollectionPrintsToggle autographId={item.id} enabled={item.prints_enabled} />
                ) : (
                  <ViewLink href={webRouteToAutograph(item.id)} />
                )}
              />
            );
          })}
        </div>
      ) : null}

      {activeTab === 'saved_cards' && savedCards.length > 0 ? (
        <div className="space-y-3">
          {savedCards.map((item) => (
            <AutographRow
              key={item.id}
              item={item}
              action={<ViewLink href={webRouteToAutograph(item.id)} />}
            />
          ))}
        </div>
      ) : null}

      {activeTab === 'saved_creators' && savedCreators.length > 0 ? (
        <div className="space-y-3">
          {savedCreators.map((creator) => (
            <CreatorRow key={creator.creator_id} creator={creator} />
          ))}
        </div>
      ) : null}

      {visibleCount === 0 ? (
        <div className="rounded-[6px] border border-gray-200 bg-white p-10 text-center">
          <h2 className="text-xl font-black text-black">
            {activeTab === 'captured'
              ? 'No captured autographs yet'
              : activeTab === 'saved_cards'
                ? 'No saved cards yet'
                : 'No saved creators yet'}
          </h2>
          <p className="mt-3 text-sm text-gray-600">
            {activeTab === 'captured'
              ? 'Capture autographs and they will appear here.'
              : activeTab === 'saved_cards'
                ? 'Saved cards will appear here.'
                : 'Saved creators will appear here.'}
          </p>
        </div>
      ) : null}

      {activeTab === 'captured' && capturedNextCursor ? (
        <LoadMore href={getPaginationHref('captured', {
          before_created_at: capturedNextCursor.beforeCreatedAt,
          before_id: capturedNextCursor.beforeId,
        })} />
      ) : null}

      {activeTab === 'saved_cards' && savedCardsNextCursor ? (
        <LoadMore href={getPaginationHref('saved_cards', {
          before_saved_at: savedCardsNextCursor.beforeSavedAt,
          before_autograph_id: savedCardsNextCursor.beforeAutographId,
        })} />
      ) : null}

      {activeTab === 'saved_creators' && savedCreatorsNextCursor ? (
        <LoadMore href={getPaginationHref('saved_creators', {
          before_saved_at: savedCreatorsNextCursor.beforeSavedAt,
          before_creator_id: savedCreatorsNextCursor.beforeCreatorId,
        })} />
      ) : null}
    </div>
  );
}

function AutographRow({
  item,
  action,
}: {
  item: WebsiteMyListing | WebsiteListing;
  action: ReactNode;
}) {
  const seqDate = [
    item.creator_sequence_number != null ? `#${item.creator_sequence_number}` : null,
    formatCardDate(item.created_at),
  ].filter(Boolean).join(' · ');
  const seriesLine = [item.series_name, formatSeriesEdition(item)]
    .filter(Boolean)
    .join(' · ');
  const creatorName = getAutographCreatorName(item);

  return (
    <article className="flex items-center gap-4 rounded-[6px] border border-gray-200 bg-white px-4 py-3">
      <Link
        href={webRouteToAutograph(item.id)}
        className="shrink-0 overflow-hidden rounded-none bg-[#1C1C1F]"
        style={{ width: 52 }}
      >
        {item.thumbnail_url ? (
          <img
            src={item.thumbnail_url}
            alt={creatorName}
            className="aspect-[3/5] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[3/5] w-full items-center justify-center text-[7px] font-bold uppercase tracking-widest text-white/40">
            -
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={webRouteToAutograph(item.id)}
          className="block text-sm font-black leading-5 text-black transition-colors hover:text-[#001B5C]"
        >
          {creatorName}
        </Link>
        <div className="mt-0.5 text-xs text-gray-500">{seqDate}</div>
        {seriesLine ? (
          <div className="mt-0.5 truncate text-xs text-gray-400">{seriesLine}</div>
        ) : null}
        <div className="mt-0.5 text-xs text-gray-400">
          Printed {item.print_count ?? 0} {(item.print_count ?? 0) === 1 ? 'time' : 'times'}
        </div>
      </div>

      <div className="shrink-0">{action}</div>
    </article>
  );
}

function CreatorRow({ creator }: { creator: WebsiteSavedCreator }) {
  return (
    <article className="flex items-center gap-4 rounded-[6px] border border-gray-200 bg-white px-4 py-3">
      <Link
        href={`/profile/${creator.creator_id}`}
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100"
      >
        {creator.avatar_url ? (
          <img
            src={creator.avatar_url}
            alt={creator.display_name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-lg font-black text-gray-400">
            {creator.display_name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={`/profile/${creator.creator_id}`}
          className="block truncate text-sm font-black leading-5 text-black transition-colors hover:text-[#001B5C]"
        >
          {creator.display_name}
        </Link>
        <div className="mt-0.5 text-xs text-gray-500">{formatSavedDate(creator.saved_at)}</div>
        <div className="mt-0.5 text-xs text-gray-400">
          {creator.print_count} public print{creator.print_count === 1 ? '' : 's'}
        </div>
      </div>

      <ViewLink href={`/profile/${creator.creator_id}`} />
    </article>
  );
}

function ViewLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="rounded-[4px] border border-gray-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
    >
      View
    </Link>
  );
}

function LoadMore({ href }: { href: string }) {
  return (
    <div className="mt-8 flex justify-center">
      <Link
        href={href}
        className="rounded-lg border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
      >
        Load More
      </Link>
    </div>
  );
}

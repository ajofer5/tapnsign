import Link from 'next/link';
import { formatMoney, getListingModeLabel, getMyListings } from '../../../lib/me';
import { requireWebSessionUser } from '../../../lib/web-auth';

export const dynamic = 'force-dynamic';

function getStatusLabel(isForSale: boolean, listingMode: 'buy_now' | 'make_offer') {
  return getListingModeLabel(listingMode);
}

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

type CollectionPageProps = {
  searchParams?: Promise<{
    before_created_at?: string;
    before_id?: string;
  }>;
};

export default async function CollectionPage({ searchParams }: CollectionPageProps) {
  const user = await requireWebSessionUser();
  const params = (await searchParams) ?? {};
  const cursor =
    params.before_created_at && params.before_id
      ? {
          beforeCreatedAt: params.before_created_at,
          beforeId: params.before_id,
        }
      : null;
  const { listings: autographs, nextCursor } = await getMyListings(user.id, 24, cursor);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Collection
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
            Your autographs
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-gray-600">
            Browse everything you own in one place, then jump into listing management whenever you want to sell.
          </p>
        </div>
        <div className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black shadow-sm">
          Showing {autographs.length} autograph{autographs.length !== 1 ? 's' : ''}
        </div>
      </div>

      {autographs.length > 0 ? (
        <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {autographs.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-[6px] bg-white shadow-sm">
              <Link href={`/autograph/${item.id}`} className="block">
                {item.thumbnail_url ? (
                  <img
                    src={item.thumbnail_url}
                    alt={item.creator_name}
                    className="aspect-[3/5] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/5] items-center justify-center bg-[#1C1C1F] text-sm font-semibold uppercase tracking-[0.25em] text-white/50">
                    Ophinia
                  </div>
                )}
              </Link>

              <div className="space-y-3 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/autograph/${item.id}`}
                      className="line-clamp-2 text-sm font-black leading-5 text-black transition-colors hover:text-[#001B5C]"
                    >
                      {item.creator_name}
                      {item.creator_sequence_number != null ? ` · #${item.creator_sequence_number}` : ''}
                    </Link>
                    {item.series_name ? (
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">
                        {item.series_name}
                        {item.series_sequence_number != null && item.series_max_size != null
                          ? ` · ${item.series_sequence_number} of ${item.series_max_size}`
                          : ''}
                      </div>
                    ) : null}
                  </div>
                  {item.is_for_sale ? (
                    <div className="shrink-0 rounded-[4px] border border-gray-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      {getStatusLabel(item.is_for_sale, item.listing_mode)}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-end justify-between gap-2 border-t border-gray-100 pt-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      {item.is_for_sale ? 'Listing' : 'Autograph'}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-gray-700">
                      {item.is_for_sale
                        ? `${getStatusLabel(item.is_for_sale, item.listing_mode)}${typeof item.price_cents === 'number' ? ` · ${formatMoney(item.price_cents)}` : ''}`
                        : [formatCardDate(item.created_at), item.print_count != null ? `Print #${item.print_count + 1}` : null].filter(Boolean).join(' · ')}
                    </div>
                    {item.series_name || formatSeriesEdition(item) ? (
                      <div className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-gray-500">
                        {[item.series_name, formatSeriesEdition(item)].filter(Boolean).join(' · ')}
                      </div>
                    ) : null}
                  </div>
                  <Link
                    href="/me/listings"
                    className={`shrink-0 rounded-[4px] px-3 py-2 text-xs font-semibold transition-colors ${
                      item.is_for_sale
                        ? 'border border-black text-black hover:bg-black hover:text-white'
                        : 'bg-[#001B5C] text-white hover:bg-[#00144A]'
                    }`}
                  >
                    {item.is_for_sale ? 'Edit Listing' : 'List'}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="web-panel mt-8 p-10 text-center">
          <h2 className="text-2xl font-black text-black">No autographs in your collection yet</h2>
          <p className="mt-3 text-base text-gray-600">
            Complete a purchase or offer flow and your collection will start building here.
          </p>
        </div>
      )}

      {autographs.length > 0 && nextCursor ? (
        <div className="mt-8 flex justify-center">
          <Link
            href={`/collection?before_created_at=${encodeURIComponent(nextCursor.beforeCreatedAt)}&before_id=${encodeURIComponent(nextCursor.beforeId)}`}
            className="rounded-lg border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
          >
            Load More
          </Link>
        </div>
      ) : null}
    </div>
  );
}

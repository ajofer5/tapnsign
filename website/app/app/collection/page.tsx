import Link from 'next/link';
import { formatMoney, getListingModeLabel, getMyListings } from '../../../lib/me';
import { requireWebSessionUser } from '../../../lib/web-auth';

export const dynamic = 'force-dynamic';

function getStatusLabel(isForSale: boolean, listingMode: 'buy_now' | 'make_offer') {
  if (!isForSale) return 'Collected';
  return getListingModeLabel(listingMode);
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
    <div className="mx-auto max-w-6xl px-6 py-10">
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
        <div className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black shadow-sm">
          Showing {autographs.length} autograph{autographs.length !== 1 ? 's' : ''}
        </div>
      </div>

      {autographs.length > 0 ? (
        <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {autographs.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-[1.75rem] bg-white shadow-sm">
              <Link href={`/app/listings/${item.id}`} className="block">
                {item.thumbnail_url ? (
                  <img
                    src={item.thumbnail_url}
                    alt={item.creator_name}
                    className="aspect-[4/5] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/5] items-center justify-center bg-[#1C1C1F] text-sm font-semibold uppercase tracking-[0.25em] text-white/50">
                    TapnSign
                  </div>
                )}
              </Link>

              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/app/listings/${item.id}`}
                      className="text-lg font-black text-black transition-colors hover:text-[#E53935]"
                    >
                      {item.creator_name}
                      {item.creator_sequence_number != null ? ` · #${item.creator_sequence_number}` : ''}
                    </Link>
                    {item.series_name ? (
                      <div className="mt-1 text-sm text-gray-600">
                        {item.series_name}
                        {item.series_sequence_number != null && item.series_max_size != null
                          ? ` · ${item.series_sequence_number} of ${item.series_max_size}`
                          : ''}
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                    {getStatusLabel(item.is_for_sale, item.listing_mode)}
                  </div>
                </div>

                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                      {item.is_for_sale
                        ? item.listing_mode === 'buy_now'
                          ? 'Price'
                          : 'Estimated Value'
                        : 'Certificate'}
                    </div>
                    <div className="mt-1 text-2xl font-black text-black">
                      {item.is_for_sale ? formatMoney(item.price_cents) : item.certificate_id}
                    </div>
                  </div>
                  <Link
                    href="/app/me/listings"
                    className="rounded-full border border-black px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
                  >
                    {item.is_for_sale ? 'Edit Listing' : 'List'}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="mt-8 rounded-[2rem] bg-white p-10 text-center shadow-sm">
          <h2 className="text-2xl font-black text-black">No autographs in your collection yet</h2>
          <p className="mt-3 text-base text-gray-600">
            Complete a purchase or offer flow and your collection will start building here.
          </p>
        </div>
      )}

      {autographs.length > 0 && nextCursor ? (
        <div className="mt-8 flex justify-center">
          <Link
            href={`/app/collection?before_created_at=${encodeURIComponent(nextCursor.beforeCreatedAt)}&before_id=${encodeURIComponent(nextCursor.beforeId)}`}
            className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
          >
            Load More
          </Link>
        </div>
      ) : null}
    </div>
  );
}

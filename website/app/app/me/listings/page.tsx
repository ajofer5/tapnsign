import Link from 'next/link';
import { getListingModeLabel, getMyListings, formatMoney } from '../../../../lib/me';
import { requireWebSessionUser } from '../../../../lib/web-auth';
import { removeListingAction, saveListingAction } from './actions';

export const dynamic = 'force-dynamic';

type MyListingsPageProps = {
  searchParams?: Promise<{
    before_created_at?: string;
    before_id?: string;
  }>;
};

export default async function MyListingsPage({ searchParams }: MyListingsPageProps) {
  const user = await requireWebSessionUser();
  const params = (await searchParams) ?? {};
  const cursor =
    params.before_created_at && params.before_id
      ? {
          beforeCreatedAt: params.before_created_at,
          beforeId: params.before_id,
        }
      : null;
  const { listings, nextCursor } = await getMyListings(user.id, 24, cursor);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Seller Workspace
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
            My Listings
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-gray-600">
            Review every autograph you own, update its listing mode and price, or remove it from sale.
          </p>
        </div>
        <div className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black shadow-sm">
          Showing {listings.length} autograph{listings.length !== 1 ? 's' : ''}
        </div>
      </div>

      {listings.length === 0 ? (
        <div className="mt-8 rounded-[2rem] bg-white p-8 text-gray-600 shadow-sm">
          You do not have any autographs in your collection yet.
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {listings.map((listing) => (
            <article key={listing.id} className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
              <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
                <div className="bg-[#1C1C1F]">
                  <Link href={`/app/listings/${listing.id}`} className="block">
                    {listing.thumbnail_url ? (
                      <img
                        src={listing.thumbnail_url}
                        alt={listing.creator_name}
                        className="aspect-[4/5] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/5] items-center justify-center text-sm font-semibold uppercase tracking-[0.25em] text-white/50">
                        TapnSign
                      </div>
                    )}
                  </Link>
                </div>

                <div className="p-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <Link
                        href={`/app/listings/${listing.id}`}
                        className="text-2xl font-black text-black transition-colors hover:text-[#E53935]"
                      >
                        {listing.creator_name}
                        {listing.creator_sequence_number != null ? ` · #${listing.creator_sequence_number}` : ''}
                      </Link>
                      {listing.series_name ? (
                        <div className="mt-2 text-sm text-gray-600">
                          {listing.series_name}
                          {listing.series_sequence_number != null && listing.series_max_size != null
                            ? ` · ${listing.series_sequence_number} of ${listing.series_max_size}`
                            : ''}
                        </div>
                      ) : (
                        <div className="mt-2 text-sm text-transparent">Series</div>
                      )}
                    </div>
                    <div className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                      {listing.is_for_sale ? getListingModeLabel(listing.listing_mode) : 'Not Listed'}
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-2">
                    <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
                      Current
                    </div>
                    <div className="text-3xl font-black text-black">
                      {listing.is_for_sale ? formatMoney(listing.price_cents) : 'Not for Sale'}
                    </div>
                    <div className="text-sm text-gray-500">
                      Certificate {listing.certificate_id}
                    </div>
                  </div>

                  <form action={saveListingAction.bind(null, listing.id)} className="mt-7 space-y-5">
                    <div className="grid gap-5 md:grid-cols-2">
                      <label className="block">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                          Listing Mode
                        </div>
                        <select
                          name="listing_mode"
                          defaultValue={listing.listing_mode}
                          className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-black outline-none transition-colors focus:border-black"
                        >
                          <option value="buy_now">Fixed Price</option>
                          <option value="make_offer">Estimated Value</option>
                        </select>
                      </label>

                      <label className="block">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                          Price / Value
                        </div>
                        <input
                          type="text"
                          name="price"
                          defaultValue={typeof listing.price_cents === 'number' ? (listing.price_cents / 100).toFixed(2) : ''}
                          placeholder="25.00"
                          className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-black outline-none transition-colors placeholder:text-gray-400 focus:border-black"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex items-start gap-3 rounded-2xl border border-gray-200 px-4 py-4 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          name="auto_decline_below"
                          defaultChecked={listing.auto_decline_below}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                        />
                        <span>Automatically decline offers below this estimated value.</span>
                      </label>

                      <label className="flex items-start gap-3 rounded-2xl border border-gray-200 px-4 py-4 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          name="auto_accept_above"
                          defaultChecked={listing.auto_accept_above}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                        />
                        <span>Automatically accept the first offer at or above this estimated value.</span>
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
                      >
                        {listing.is_for_sale ? 'Update Listing' : 'Create Listing'}
                      </button>
                      {listing.is_for_sale ? (
                        <button
                          type="submit"
                          formAction={removeListingAction.bind(null, listing.id)}
                          className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
                        >
                          Remove Listing
                        </button>
                      ) : null}
                      <Link
                        href={`/app/listings/${listing.id}`}
                        className="rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
                      >
                        View Listing
                      </Link>
                    </div>
                  </form>
                </div>
              </div>
            </article>
          ))}

          {nextCursor ? (
            <div className="flex justify-center pt-2">
              <Link
                href={`/app/me/listings?before_created_at=${encodeURIComponent(nextCursor.beforeCreatedAt)}&before_id=${encodeURIComponent(nextCursor.beforeId)}`}
                className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
              >
                Load More
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

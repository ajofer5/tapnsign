import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  canBuyNow,
  canMakeOffer,
  formatDate,
  formatMoney,
  getWebsiteListing,
} from '../../../../lib/listings';
import { toggleWatchlistAction } from '../../../../app/actions/watchlist';
import { getWebSessionUser } from '../../../../lib/web-auth';
import { getSavedAutographIds } from '../../../../lib/watchlist';

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getWebSessionUser();
  const listing = await getWebsiteListing(id, user?.id ?? null);
  if (!listing) notFound();
  const savedIds = user ? await getSavedAutographIds(user.id, [listing.id]) : new Set<string>();
  const isSaved = savedIds.has(listing.id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2rem] bg-white p-5 shadow-sm">
          <div className="overflow-hidden rounded-[1.5rem] bg-black">
            <video
              src={listing.video_url}
              poster={listing.thumbnail_url ?? undefined}
              controls
              playsInline
              className="aspect-[4/5] w-full object-cover"
            />
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Listing
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
            {listing.creator?.display_name ?? 'Creator'}
            {listing.creator_sequence_number != null ? ` · #${listing.creator_sequence_number}` : ''}
          </h1>
          {listing.series_name ? (
            <p className="mt-2 text-base text-gray-600">
              {listing.series_name}
              {listing.series_sequence_number != null && listing.series_max_size != null
                ? ` · ${listing.series_sequence_number} of ${listing.series_max_size}`
                : ''}
            </p>
          ) : null}

          <div className="mt-8 rounded-[1.5rem] bg-[#F6F6F7] p-6">
            <div className="flex items-end justify-between gap-6">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
                  {listing.offer_locked_until
                    ? 'Status'
                    : listing.listing_mode === 'buy_now'
                      ? 'Price'
                      : 'Estimated Value'}
                </div>
                <div className="mt-2 text-4xl font-black text-black">
                  {listing.offer_locked_until ? 'Sale Pending' : formatMoney(listing.price_cents)}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {canBuyNow(listing) ? (
                  <Link
                    href={`/app/checkout/${listing.id}`}
                    className="rounded-full bg-black px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
                  >
                    Buy
                  </Link>
                ) : null}
                {canMakeOffer(listing) ? (
                  <Link
                    href={`/app/offer/${listing.id}`}
                    className="rounded-full bg-black px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
                  >
                    Make Offer
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-4 text-sm text-gray-700">
            <Detail label="Captured" value={formatDate(listing.created_at)} />
            <Detail label="Certificate" value={listing.certificate_id} />
            <Detail label="Listed by" value={listing.owner?.display_name ?? '—'} />
            <Detail label="Creator verified" value={listing.creator?.verified ? 'Yes' : 'No'} />
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <form action={toggleWatchlistAction.bind(null, listing.id, isSaved, `/app/listings/${listing.id}`)}>
              <button
                type="submit"
                className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
              >
                {isSaved ? 'Saved' : 'Save'}
              </button>
            </form>
            <Link
              href={`/verify/${listing.certificate_id}`}
              className="rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
            >
              View Certificate
            </Link>
            {listing.creator_id ? (
              <Link
                href={`/profile/${listing.creator_id}`}
                className="rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
              >
                Creator Profile
              </Link>
            ) : null}
          </div>
        </section>
      </div>
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

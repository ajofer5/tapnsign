import Link from 'next/link';
import { canBuyNow, canMakeOffer, formatMoney, type WebsiteListing } from '../lib/listings';
import { toggleWatchlistAction } from '../app/actions/watchlist';

export function WebListingCard({
  listing,
  isSaved = false,
  savePath = '/marketplace',
}: {
  listing: WebsiteListing;
  isSaved?: boolean;
  savePath?: string;
}) {
  const creatorName = listing.creator?.display_name ?? 'Creator';
  const ownerName = listing.owner?.display_name ?? '—';

  return (
    <article className="overflow-hidden rounded-[1.75rem] bg-white shadow-sm">
      <Link href={`/app/listings/${listing.id}`} className="block">
        {listing.thumbnail_url ? (
          <img
            src={listing.thumbnail_url}
            alt={creatorName}
            className="aspect-[4/5] w-full object-cover"
          />
        ) : listing.video_url ? (
          <video
            src={listing.video_url}
            autoPlay
            muted
            loop
            playsInline
            className="aspect-[4/5] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center bg-[#1C1C1F] text-sm font-semibold uppercase tracking-[0.25em] text-white/50">
            TapnSign
          </div>
        )}
      </Link>

      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href={`/profile/${listing.creator_id}`}
              className="text-lg font-black text-black transition-colors hover:text-[#E53935]"
            >
              {creatorName}
              {listing.creator_sequence_number != null ? ` · #${listing.creator_sequence_number}` : ''}
            </Link>
            {listing.series_name ? (
              <div className="mt-1 text-sm text-gray-600">
                {listing.series_name}
                {listing.series_sequence_number != null && listing.series_max_size != null
                  ? ` · ${listing.series_sequence_number} of ${listing.series_max_size}`
                  : ''}
              </div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
              Listed by
            </div>
            <div className="mt-1 text-sm font-semibold normal-case tracking-normal text-black">
              {ownerName}
            </div>
            <form action={toggleWatchlistAction.bind(null, listing.id, isSaved, savePath)} className="mt-3">
              <button
                type="submit"
                className="rounded-full border border-black px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-black hover:text-white"
              >
                {isSaved ? 'Saved' : 'Save'}
              </button>
            </form>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4 pt-1">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
              {listing.offer_locked_until
                ? 'Status'
                : listing.listing_mode === 'buy_now'
                  ? 'Price'
                  : 'Estimated Value'}
            </div>
            <div className="mt-1 text-2xl font-black text-black">
              {listing.offer_locked_until ? 'Sale Pending' : formatMoney(listing.price_cents)}
            </div>
          </div>
          {canBuyNow(listing) ? (
            <Link
              href={`/app/checkout/${listing.id}`}
              className="rounded-full border border-black px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
            >
              Buy
            </Link>
          ) : null}
          {canMakeOffer(listing) ? (
            <Link
              href={`/app/offer/${listing.id}`}
              className="rounded-full border border-black px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
            >
              Make Offer
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

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

  return (
    <article className="overflow-hidden rounded-[6px] bg-white shadow-sm">
      <Link href={`/autograph/${listing.id}`} className="block">
        {listing.thumbnail_url ? (
          <img
            src={listing.thumbnail_url}
            alt={creatorName}
            className="aspect-[60/85] w-full object-cover"
          />
        ) : listing.video_url ? (
          <video
            src={listing.video_url}
            autoPlay
            muted
            loop
            playsInline
            className="aspect-[60/85] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[60/85] items-center justify-center bg-[#1C1C1F] text-sm font-semibold uppercase tracking-[0.25em] text-white/50">
            TapnSign
          </div>
        )}
      </Link>

      <div className="space-y-3 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/profile/${listing.creator_id}`}
              className="line-clamp-2 text-sm font-black leading-5 text-black transition-colors hover:text-[#001B5C]"
            >
              {creatorName}
              {listing.creator_sequence_number != null ? ` · #${listing.creator_sequence_number}` : ''}
            </Link>
            {listing.series_name ? (
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">
                {listing.series_name}
                {listing.series_sequence_number != null && listing.series_max_size != null
                  ? ` · ${listing.series_sequence_number} of ${listing.series_max_size}`
                  : ''}
              </div>
            ) : null}
          </div>
          <form action={toggleWatchlistAction.bind(null, listing.id, isSaved, savePath)}>
            <button
              type="submit"
              className="rounded-[4px] border border-gray-300 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
            >
              {isSaved ? 'Saved' : 'Save'}
            </button>
          </form>
        </div>

        <div className="flex items-end justify-between gap-2 border-t border-gray-100 pt-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
              {listing.offer_locked_until ? 'Listing' : listing.listing_mode === 'buy_now' ? 'Listing' : 'Listing'}
            </div>
            <div className="mt-1 text-xs leading-5 text-gray-700">
              {listing.offer_locked_until
                ? 'Sale Pending'
                : `${listing.listing_mode === 'buy_now' ? 'Fixed Price' : 'Estimated Value'}${typeof listing.price_cents === 'number' ? ` · ${formatMoney(listing.price_cents)}` : ''}`}
            </div>
          </div>
          <div className="shrink-0">
            {canBuyNow(listing) ? (
              <Link
                href={`/checkout/${listing.id}`}
                className="rounded-[4px] bg-black px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
              >
                Buy
              </Link>
            ) : null}
            {canMakeOffer(listing) ? (
              <Link
                href={`/offer/${listing.id}`}
                className="rounded-[4px] bg-black px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
              >
                Offer
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

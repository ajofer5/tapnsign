import Link from 'next/link';
import { type WebsiteListing } from '../lib/listings';

export function WebListingCard({
  listing,
  isSaved: _isSaved = false,
  savePath: _savePath = '/marketplace',
}: {
  listing: WebsiteListing;
  isSaved?: boolean;
  savePath?: string;
}) {
  const creatorName = listing.creator?.display_name ?? 'Creator';

  return (
    <article className="overflow-hidden rounded-none bg-white shadow-sm">
      <Link href={`/autograph/${listing.id}`} className="block">
        {listing.thumbnail_url ? (
          <img
            src={listing.thumbnail_url}
            alt={creatorName}
            className="aspect-[3/5] w-full object-cover"
          />
        ) : listing.video_url ? (
          <video
            src={listing.video_url}
            autoPlay
            muted
            loop
            playsInline
            className="aspect-[3/5] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[3/5] items-center justify-center bg-[#1C1C1F] text-sm font-semibold uppercase tracking-[0.25em] text-white/50">
            Ophinia
          </div>
        )}
      </Link>

      <div className="p-3.5">
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
          <Link
            href={`/autograph/${listing.id}`}
            className="shrink-0 rounded-[4px] bg-[#001B5C] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#00144A]"
          >
            Buy Print
          </Link>
        </div>
      </div>
    </article>
  );
}

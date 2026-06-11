'use client';

import Link from 'next/link';
import { useState } from 'react';
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
  const [playing, setPlaying] = useState(false);
  const creatorName = listing.creator?.display_name ?? 'Creator';

  return (
    <article className="overflow-hidden rounded-none bg-white shadow-sm">
      <div className="relative aspect-[3/5] w-full bg-[#1C1C1F]">
        {playing && listing.video_url ? (
          <video
            src={listing.video_url}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : listing.thumbnail_url ? (
          <img
            src={listing.thumbnail_url}
            alt={creatorName}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : listing.video_url ? (
          <video
            src={listing.video_url}
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-semibold uppercase tracking-[0.25em] text-white/50">
            Ophinia
          </div>
        )}

        {/* Play / Pause overlay */}
        {listing.video_url ? (
          <button
            onClick={() => setPlaying((p) => !p)}
            className="absolute inset-0 flex items-center justify-center"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {!playing && (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 translate-x-0.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            )}
          </button>
        ) : (
          <Link href={`/autograph/${listing.id}`} className="absolute inset-0" />
        )}
      </div>

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

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { type WebsiteListing } from '../lib/listings';
import { PrintCheckoutModal } from './print-checkout-modal';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function WebListingCard({
  listing,
  isSaved: _isSaved = false,
  savePath: _savePath = '/marketplace',
  showProfileButton = false,
}: {
  listing: WebsiteListing;
  isSaved?: boolean;
  savePath?: string;
  showProfileButton?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const creatorName = listing.creator?.display_name ?? 'Creator';
  const cardImageUrl = listing.print_preview_url ?? listing.thumbnail_url;

  return (
    <>
      <article className="overflow-hidden rounded-none border border-gray-200 bg-white">
        {/* Media area — natural height so image ratio determines the card shape */}
        <div className="relative w-full bg-[#1C1C1F] overflow-hidden">
          {playing && listing.video_url ? (
            <video
              src={listing.video_url}
              autoPlay
              muted
              loop
              playsInline
              className="block w-full h-auto"
            />
          ) : cardImageUrl ? (
            <>
              <img
                src={cardImageUrl}
                alt={creatorName}
                className="block w-full h-auto"
                draggable={false}
              />
            </>
          ) : listing.video_url ? (
            <video
              src={listing.video_url}
              muted
              playsInline
              className="block w-full h-auto"
            />
          ) : (
            <div className="flex aspect-[3/5] items-center justify-center text-sm font-semibold uppercase tracking-[0.25em] text-white/50">
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
          ) : null}
        </div>

        {/* Metadata + button */}
        <div className="border-t border-gray-200 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="line-clamp-1 text-xs leading-5 text-gray-500">
                {listing.creator_sequence_number != null ? `#${listing.creator_sequence_number} · ` : ''}
                {formatDate(listing.created_at)}
              </p>
              {listing.series_name ? (
                <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-gray-500">
                  {listing.series_name}
                  {listing.series_sequence_number != null && listing.series_max_size != null
                    ? ` · ${listing.series_sequence_number} of ${listing.series_max_size}`
                    : ''}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {showProfileButton && (
                <Link
                  href={`/profile/${listing.creator_id}`}
                  className="rounded-[4px] border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-400"
                >
                  View Profile
                </Link>
              )}
              {listing.prints_enabled ? (
                <button
                  onClick={() => setCheckoutOpen(true)}
                  className="rounded-[4px] bg-[#001B5C] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#00144A]"
                >
                  Print Moment
                </button>
              ) : (
                <Link
                  href={`/autograph/${listing.id}`}
                  className="rounded-[4px] border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-400"
                >
                  View
                </Link>
              )}
            </div>
          </div>
        </div>
      </article>

      {checkoutOpen && (
        <PrintCheckoutModal
          autographId={listing.id}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
    </>
  );
}

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
  isSaved = false,
  savePath = '/marketplace',
  showProfileButton = false,
  selectionMode = false,
  selected = false,
  onToggleSelected,
}: {
  listing: WebsiteListing;
  isSaved?: boolean;
  savePath?: string;
  showProfileButton?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: (listing: WebsiteListing) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [saved, setSaved] = useState(isSaved);
  const [savingMoment, setSavingMoment] = useState(false);
  const creatorName = listing.creator?.display_name ?? 'Creator';

  const toggleSaveMoment = async () => {
    if (savingMoment) return;
    setSavingMoment(true);
    const method = saved ? 'DELETE' : 'POST';
    try {
      const res = await fetch('/api/save-moment', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autograph_id: listing.id }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(savePath)}`;
        return;
      }
      if (res.ok) setSaved((prev) => !prev);
    } finally {
      setSavingMoment(false);
    }
  };
  const cardImageUrl = listing.print_preview_url ?? listing.thumbnail_url;

  return (
    <>
      <article className="overflow-hidden rounded-none border border-gray-200 bg-white">
        {/* Media area — natural height so image ratio determines the card shape */}
        <div
          className="relative w-full bg-[#1C1C1F] overflow-hidden"
          onClick={() => {
            if (selectionMode) onToggleSelected?.(listing);
          }}
        >
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
              onClick={(event) => {
                event.stopPropagation();
                if (selectionMode) {
                  onToggleSelected?.(listing);
                } else {
                  setPlaying((p) => !p);
                }
              }}
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
          {selectionMode ? (
            <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-white/90 text-sm font-black text-[#001B5C] shadow">
              {selected ? '✓' : ''}
            </div>
          ) : null}
        </div>

        {/* Metadata + buttons */}
        <div className="border-t border-gray-200 p-3.5 space-y-2.5">
          {/* Metadata */}
          <div>
            <p className="line-clamp-1 text-xs leading-5 text-gray-500">
              {[
                listing.creator_sequence_number != null ? `#${listing.creator_sequence_number}` : null,
                formatDate(listing.created_at),
              ].filter(Boolean).join(' · ')}
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

          {/* Buttons */}
          <div className="flex items-center gap-1.5">
              {showProfileButton && (
                <Link
                  href={`/profile/${listing.creator_id}`}
                  className="rounded-[4px] border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-400"
                >
                  View Profile
                </Link>
              )}
              {!selectionMode && (
                <button
                  onClick={toggleSaveMoment}
                  disabled={savingMoment}
                  className="rounded-[4px] bg-[#001B5C] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#00144A] disabled:opacity-50"
                >
                  {saved ? 'Saved' : 'Save Moment'}
                </button>
              )}
              {listing.prints_enabled ? (
                <button
                  onClick={() => {
                    if (selectionMode) onToggleSelected?.(listing);
                    else setCheckoutOpen(true);
                  }}
                  className={`rounded-[4px] px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    selectionMode && selected
                      ? 'bg-[#E8EEF9] text-[#001B5C]'
                      : 'bg-[#001B5C] text-white hover:bg-[#00144A]'
                  }`}
                >
                  {selectionMode ? (selected ? 'Selected' : 'Select') : 'Print Moment'}
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

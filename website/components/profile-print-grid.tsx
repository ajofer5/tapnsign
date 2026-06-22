'use client';

import { useMemo, useState } from 'react';
import { type WebsiteListing } from '../lib/listings';
import { PrintCheckoutModal } from './print-checkout-modal';
import { WebListingCard } from './web-listing-card';

const MAX_SELECTED_PRINTS = 5;

export function ProfilePrintGrid({
  listings,
  savedIds,
  savePath,
}: {
  listings: WebsiteListing[];
  savedIds: string[];
  savePath: string;
}) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);
  const selectedListings = listings.filter((listing) => selectedIds.includes(listing.id));
  const firstSelected = selectedListings[0] ?? null;
  const selectedPrintPreviews = selectedListings.map((listing) => {
    const sequenceLabel = listing.creator_sequence_number != null ? `#${listing.creator_sequence_number}` : 'Official Print';
    const seriesLabel = [
      listing.series_name,
      listing.series_sequence_number != null && listing.series_max_size != null
        ? `${listing.series_sequence_number} of ${listing.series_max_size}`
        : null,
    ].filter(Boolean).join(' · ');

    return {
      id: listing.id,
      imageUrl: listing.print_preview_url ?? listing.thumbnail_url,
      label: sequenceLabel,
      subtitle: seriesLabel || null,
    };
  });

  function toggleSelection(listing: WebsiteListing) {
    setSelectedIds((current) => {
      if (current.includes(listing.id)) return current.filter((id) => id !== listing.id);
      if (current.length >= MAX_SELECTED_PRINTS) return current;
      return [...current, listing.id];
    });
  }

  function closeSelection() {
    setSelectionMode(false);
    setSelectedIds([]);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-gray-500">
          {listings.length} public print{listings.length !== 1 ? 's' : ''}
        </span>
        {listings.length > 1 ? (
          <div className="flex items-center gap-2">
            {selectionMode ? (
              <button
                type="button"
                onClick={closeSelection}
                className="rounded-[4px] border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:border-gray-400"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (selectionMode && selectedIds.length > 0) setCheckoutOpen(true);
                else setSelectionMode(true);
              }}
              disabled={selectionMode && selectedIds.length === 0}
              className="rounded-[4px] bg-[#001B5C] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#00144A] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {selectionMode ? `Print ${selectedIds.length || ''}`.trim() : 'Select Prints'}
            </button>
          </div>
        ) : null}
      </div>

      {selectionMode ? (
        <p className="mb-4 text-sm text-gray-600">
          Select up to {MAX_SELECTED_PRINTS} moments. One copy of each selected print ships together.
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {listings.map((listing) => (
          <WebListingCard
            key={listing.id}
            listing={listing}
            isSaved={savedSet.has(listing.id)}
            savePath={savePath}
            selectionMode={selectionMode}
            selected={selectedIds.includes(listing.id)}
            onToggleSelected={toggleSelection}
          />
        ))}
      </div>

      {checkoutOpen && firstSelected ? (
        <PrintCheckoutModal
          autographId={firstSelected.id}
          autographIds={selectedIds}
          selectedPrints={selectedPrintPreviews}
          bundleTitle={`${selectedIds.length} selected prints`}
          onClose={() => setCheckoutOpen(false)}
        />
      ) : null}
    </>
  );
}

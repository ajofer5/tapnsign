'use client';

import { useState, useTransition } from 'react';
import { updateProfileAvatarAction } from '../app/(app)/account/actions';

type AvatarOption = {
  id: string;
  thumbnail_url: string | null;
};

export function AvatarPicker({
  options,
  selectedId,
  displayName,
  currentAvatarUrl,
}: {
  options: AvatarOption[];
  selectedId: string | null;
  displayName: string;
  currentAvatarUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSelect(autographId: string | null) {
    const formData = new FormData();
    if (autographId) formData.set('autograph_id', autographId);
    startTransition(() => {
      void updateProfileAvatarAction(formData).then(() => setOpen(false));
    });
  }

  return (
    <div>
      {/* Current selection + change button */}
      <div className="flex items-center gap-4">
        <div className="w-[52px] shrink-0 overflow-hidden rounded-[4px] bg-[#1C1C1F]">
          {currentAvatarUrl ? (
            <img src={currentAvatarUrl} alt={displayName} className="aspect-[3/5] w-full object-cover" />
          ) : (
            <div className="flex aspect-[3/5] w-full items-center justify-center text-xs font-bold text-white/40">
              —
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 transition-colors hover:border-black hover:text-black disabled:opacity-50"
          >
            {open ? 'Cancel' : 'Change'}
          </button>
          {selectedId && (
            <button
              type="button"
              onClick={() => handleSelect(null)}
              disabled={isPending}
              className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-500 transition-colors hover:border-black hover:text-black disabled:opacity-50"
            >
              {isPending ? '…' : 'Clear'}
            </button>
          )}
        </div>
      </div>

      {/* Picker grid */}
      {open && (
        <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-[#F7F7F8] p-3">
          {options.length === 0 ? (
            <p className="text-sm text-gray-500">No autographs available yet.</p>
          ) : (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
              {options.map((option) => {
                const isSelected = option.id === selectedId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelect(option.id)}
                    disabled={isPending}
                    className={`overflow-hidden rounded-[4px] border transition-colors disabled:opacity-50 ${
                      isSelected ? 'border-[#001B5C]' : 'border-transparent hover:border-gray-400'
                    }`}
                  >
                    {option.thumbnail_url ? (
                      <img
                        src={option.thumbnail_url}
                        alt=""
                        className="aspect-[3/5] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[3/5] w-full items-center justify-center bg-[#1C1C1F] text-[8px] font-bold text-white/40">
                        —
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {isPending && <p className="mt-2 text-xs text-gray-400">Saving…</p>}
    </div>
  );
}

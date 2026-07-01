'use client';

import { useState } from 'react';
import { PrintCheckoutModal } from './print-checkout-modal';

export function PrintPreviewButton({ autographId }: { autographId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg bg-[#001B5C] px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#00144A]"
      >
        Print Preview
      </button>
      {open && (
        <PrintCheckoutModal
          autographId={autographId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

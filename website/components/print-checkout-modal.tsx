'use client';

import { useEffect, useState } from 'react';

type PreviewData = {
  autograph_id: string;
  creator_name: string;
  creator_id: string;
  thumbnail_url: string | null;
  item_cents: number;
  shipping_cents: number;
};

type Props = {
  autographId: string;
  onClose: () => void;
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function PrintCheckoutModal({ autographId, onClose }: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/print-preview/${autographId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'Could not load print details.');
        setPreview(data);
      })
      .catch((e) => setLoadError(e.message));
  }, [autographId]);

  // Close on Escape key
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const itemTotal = preview ? preview.item_cents * quantity : 0;
  const shipping = preview?.shipping_cents ?? 0;
  const total = itemTotal + shipping;

  async function handleBuy() {
    if (!preview || !ageConfirmed) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch('/api/print-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autograph_id: autographId, quantity, email: email.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error ?? 'Could not create checkout session.');
      window.location.href = data.url;
    } catch (e: any) {
      setSubmitError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-black tracking-tight text-black">Preview Print</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto p-5">
          {/* Loading / Error */}
          {!preview && !loadError && (
            <div className="flex h-32 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#001B5C] border-t-transparent" />
            </div>
          )}

          {loadError && (
            <p className="py-8 text-center text-sm text-red-500">{loadError}</p>
          )}

          {preview && (
            <>
              {/* Full-width print preview image with watermark */}
              <div className="relative overflow-hidden rounded-lg bg-[#151718]" style={{ aspectRatio: '4/5' }}>
                {preview.thumbnail_url ? (
                  <img
                    src={preview.thumbnail_url}
                    alt={preview.creator_name}
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[9px] font-bold uppercase tracking-widest text-white/40">
                    Ophinia
                  </div>
                )}
                {/* Watermark overlay — matches app style */}
                <div className="pointer-events-none absolute inset-0 select-none overflow-hidden flex items-center justify-center">
                  {/* Diagonal band */}
                  <div
                    className="absolute w-[150%] py-3 flex items-center justify-center"
                    style={{
                      transform: 'rotate(-28deg)',
                      backgroundColor: 'rgba(255,255,255,0.82)',
                      borderTop: '1px solid rgba(0,27,92,0.35)',
                      borderBottom: '1px solid rgba(0,27,92,0.35)',
                    }}
                  >
                    <span className="text-[#001B5C] text-2xl font-black tracking-[0.08em] uppercase">
                      PREVIEW
                    </span>
                  </div>
                  {/* Bottom badge */}
                  <div
                    className="absolute bottom-2.5 px-2.5 py-1"
                    style={{ backgroundColor: 'rgba(0,27,92,0.82)' }}
                  >
                    <span className="text-white text-[10px] font-bold uppercase tracking-[0.12em]">
                      Official print preview
                    </span>
                  </div>
                </div>
              </div>

              {/* Creator info + quantity */}
              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Official Print</p>
                  <p className="mt-0.5 text-sm font-black text-black">{preview.creator_name}</p>
                  <p className="mt-1 text-xs text-gray-500">8×10 lustre photo print · ships from US</p>
                </div>
                {/* Quantity */}
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Qty</span>
                  <div className="flex items-center">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-l-md border border-gray-200 text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-40"
                      disabled={quantity <= 1}
                    >
                      −
                    </button>
                    <span className="flex h-7 w-7 items-center justify-center border-y border-gray-200 text-sm font-bold tabular-nums">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(5, q + 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-r-md border border-gray-200 text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-40"
                      disabled={quantity >= 5}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Price breakdown */}
              <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>{formatMoney(preview.item_cents)} × {quantity}</span>
                  <span>{formatMoney(itemTotal)}</span>
                </div>
                <div className="mt-1 flex justify-between text-gray-600">
                  <span>Standard Shipping (US)</span>
                  <span>{formatMoney(shipping)}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 font-black text-black">
                  <span>Total</span>
                  <span>{formatMoney(total)}</span>
                </div>
              </div>

              {/* Email */}
              <div className="mt-4">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Email (for order confirmation)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-black placeholder-gray-400 outline-none focus:border-[#001B5C] focus:ring-1 focus:ring-[#001B5C]"
                  autoComplete="email"
                />
              </div>

              {/* Age / ToS */}
              <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#001B5C]"
                />
                <span className="text-xs leading-5 text-gray-500">
                  I confirm I am 18 or older and agree to the{' '}
                  <a href="/terms" target="_blank" className="underline hover:text-black">Terms of Service</a>.
                  Shipping is to US addresses only.
                </span>
              </label>

              {submitError && (
                <p className="mt-3 text-xs text-red-500">{submitError}</p>
              )}

              {/* Buy button */}
              <button
                onClick={handleBuy}
                disabled={!ageConfirmed || submitting}
                className="mt-4 w-full rounded-lg bg-[#001B5C] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#00144A] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Redirecting to payment…' : `Buy Print — ${formatMoney(total)}`}
              </button>

              <p className="mt-2 text-center text-[10px] text-gray-400">
                Secured by Stripe · Address collected at checkout
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

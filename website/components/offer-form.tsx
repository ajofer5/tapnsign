'use client';

export function OfferForm({
  autographId,
  suggestedAmount,
}: {
  autographId: string;
  suggestedAmount: string;
}) {
  return (
    <form action={`/offer/${autographId}/start`} method="post" className="web-panel-inset mt-8 p-6">
      <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
        Your Offer
      </label>
      <input
        type="text"
        name="amount"
        defaultValue={suggestedAmount}
        placeholder="0.00"
        className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-4 py-4 text-2xl font-black text-black outline-none transition-colors focus:border-black"
      />
      <button
        type="submit"
        className="mt-5 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
      >
        Authorize and Send Offer
      </button>
      <p className="mt-4 text-sm leading-7 text-gray-600">
        TapnSign places an authorization hold before sending the offer. If the seller declines, counters, or the offer expires, the hold is released automatically.
      </p>
    </form>
  );
}

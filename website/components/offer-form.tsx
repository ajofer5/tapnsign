'use client';

import { useActionState } from 'react';
import { submitOfferAction, type OfferFormState } from '../app/app/offer/[id]/actions';

export function OfferForm({
  autographId,
  suggestedAmount,
}: {
  autographId: string;
  suggestedAmount: string;
}) {
  const [state, formAction, pending] = useActionState<OfferFormState, FormData>(
    submitOfferAction.bind(null, autographId),
    {}
  );

  return (
    <form action={formAction} className="mt-8 rounded-[1.75rem] bg-[#F6F6F7] p-6">
      <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
        Your Offer
      </label>
      <input
        type="text"
        name="amount"
        defaultValue={suggestedAmount}
        placeholder="0.00"
        className="mt-3 w-full rounded-2xl border border-gray-300 bg-white px-4 py-4 text-2xl font-black text-black outline-none transition-colors focus:border-black"
      />
      {state.error ? (
        <p className="mt-3 text-sm font-medium text-[#B3261E]">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-5 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send Offer'}
      </button>
      <p className="mt-4 text-sm leading-7 text-gray-600">
        Offers expire in 24 hours if the seller does not respond.
      </p>
    </form>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatMoney } from '../../../../../lib/listings';
import { getAcceptedOffer } from '../../../../../lib/offers';
import { requireWebSessionUser } from '../../../../../lib/web-auth';

function formatDeadline(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function OfferCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; canceled?: string; error?: string }>;
}) {
  const { id } = await params;
  const user = await requireWebSessionUser();
  const offer = await getAcceptedOffer(id);
  if (!offer || offer.buyer_id !== user.id) notFound();

  const resolvedSearch = await searchParams;
  const status = resolvedSearch?.status;
  const canceled = resolvedSearch?.canceled === '1';
  const error = resolvedSearch?.error;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-[2rem] bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
          Accepted Offer Checkout
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
          {offer.autograph.creator_name}
          {offer.autograph.creator_sequence_number != null ? ` · #${offer.autograph.creator_sequence_number}` : ''}
        </h1>
        {offer.autograph.series_name ? (
          <p className="mt-2 text-base text-gray-600">
            {offer.autograph.series_name}
            {offer.autograph.series_sequence_number != null && offer.autograph.series_max_size != null
              ? ` · ${offer.autograph.series_sequence_number} of ${offer.autograph.series_max_size}`
              : ''}
          </p>
        ) : null}

        <div className="mt-8 rounded-[1.75rem] bg-[#F6F6F7] p-6">
          <div className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Accepted Offer
            </span>
            <span className="text-3xl font-black text-black">
              {formatMoney(offer.amount_cents)}
            </span>
          </div>
          <div className="pt-4 text-sm leading-7 text-gray-600">
            Payment due by {formatDeadline(offer.payment_due_at)}.
          </div>
        </div>

        {status === 'success' ? (
          <div className="mt-6 rounded-2xl bg-[#EFF6EC] px-5 py-4 text-sm font-medium text-[#2B6A1C]">
            Purchase complete. Ownership has been transferred to your account.
          </div>
        ) : null}
        {canceled ? (
          <div className="mt-6 rounded-2xl bg-[#FFF5E5] px-5 py-4 text-sm font-medium text-[#8A5A00]">
            Checkout was canceled before payment completed.
          </div>
        ) : null}
        {error === 'blocked' ? (
          <div className="mt-6 rounded-2xl bg-[#FDECEC] px-5 py-4 text-sm font-medium text-[#B3261E]">
            You cannot complete this purchase because one of the accounts has been blocked.
          </div>
        ) : null}
        {error && error !== 'blocked' ? (
          <div className="mt-6 rounded-2xl bg-[#FDECEC] px-5 py-4 text-sm font-medium text-[#B3261E]">
            Could not complete checkout. Please try again.
          </div>
        ) : null}

        {offer.status === 'accepted' && !offer.accepted_transfer_id ? (
          <form action={`/app/offers/${offer.id}/checkout/start`} method="post" className="mt-8">
            <button
              type="submit"
              className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
            >
              Continue to Payment
            </button>
          </form>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/app/listings/${offer.autograph_id}`}
            className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
          >
            View Listing
          </Link>
          <Link
            href={`/verify/${offer.autograph.certificate_id}`}
            className="rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
          >
            View Certificate
          </Link>
        </div>
      </div>
    </div>
  );
}

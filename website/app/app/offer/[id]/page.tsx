import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OfferForm } from '../../../../components/offer-form';
import { canMakeOffer, formatMoney, getWebsiteListing } from '../../../../lib/listings';

export default async function OfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; error?: string }>;
}) {
  const { id } = await params;
  const listing = await getWebsiteListing(id);
  if (!listing) notFound();
  const resolvedSearch = await searchParams;
  const status = resolvedSearch?.status;
  const error = resolvedSearch?.error;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-[2rem] bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
          Make Offer
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
          {listing.creator?.display_name ?? 'Creator'}
          {listing.creator_sequence_number != null ? ` · #${listing.creator_sequence_number}` : ''}
        </h1>
        <p className="mt-4 text-lg leading-8 text-gray-600">
          Send your offer securely on TapnSign web.
        </p>

        <div className="mt-8 rounded-[1.75rem] bg-[#F6F6F7] p-6">
          <div className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Estimated Value
            </span>
            <span className="text-3xl font-black text-black">
              {listing.offer_locked_until ? 'Sale Pending' : formatMoney(listing.price_cents)}
            </span>
          </div>
          <div className="pt-4 text-sm leading-7 text-gray-600">
            {canMakeOffer(listing)
              ? 'Submit an offer here whether you arrived from the app or started here on the web.'
              : 'This listing is not currently accepting offers. It may be sale pending or fixed-price only.'}
          </div>
        </div>

        {status === 'sent' ? (
          <div className="mt-6 rounded-2xl bg-[#EFF6EC] px-5 py-4 text-sm font-medium text-[#2B6A1C]">
            Your offer was sent successfully.
          </div>
        ) : null}
        {status === 'accepted' ? (
          <div className="mt-6 rounded-2xl bg-[#EFF6EC] px-5 py-4 text-sm font-medium text-[#2B6A1C]">
            Your offer was automatically accepted. Payment checkout is the next step.
          </div>
        ) : null}
        {status === 'auto-decline' ? (
          <div className="mt-6 rounded-2xl bg-[#FFF5E5] px-5 py-4 text-sm font-medium text-[#8A5A00]">
            Your offer was sent, but the seller has automatic decline enabled for offers below their estimated value.
          </div>
        ) : null}
        {error === 'blocked' ? (
          <div className="mt-6 rounded-2xl bg-[#FDECEC] px-5 py-4 text-sm font-medium text-[#B3261E]">
            You cannot send an offer because one of the accounts has been blocked.
          </div>
        ) : null}

        {canMakeOffer(listing) ? (
          <OfferForm
            autographId={listing.id}
            suggestedAmount={
              typeof listing.price_cents === 'number'
                ? (listing.price_cents / 100).toFixed(2)
                : ''
            }
          />
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/app/listings/${listing.id}`}
            className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
          >
            Back to Listing
          </Link>
          {listing.listing_mode === 'buy_now' ? (
            <Link
              href={`/app/checkout/${listing.id}`}
              className="rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
            >
              Buy Instead
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

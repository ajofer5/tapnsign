import Link from 'next/link';
import {
  formatDateTime,
  formatMoney,
  getMyOfferQueue,
} from '../../../../lib/me';
import { requireWebSessionUser } from '../../../../lib/web-auth';
import { respondOfferAction } from './actions';

export const dynamic = 'force-dynamic';

type MyOffersPageProps = {
  searchParams?: Promise<{
    before_headline_amount?: string;
    before_headline_created_at?: string;
    before_autograph_id?: string;
  }>;
};

export default async function MyOffersPage({ searchParams }: MyOffersPageProps) {
  const user = await requireWebSessionUser();
  const params = (await searchParams) ?? {};
  const cursor =
    params.before_headline_amount &&
    params.before_headline_created_at &&
    params.before_autograph_id
      ? {
          beforeHeadlineAmount: Number(params.before_headline_amount),
          beforeHeadlineCreatedAt: params.before_headline_created_at,
          beforeAutographId: params.before_autograph_id,
        }
      : null;
  const { groups: offerQueue, nextCursor } = await getMyOfferQueue(user.id, 24, cursor);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Seller Workspace
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
            Offer Queue
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-gray-600">
            Review incoming offers by autograph. Highest active offers lead, and backup offers remain on hold while accepted buyers complete payment.
          </p>
        </div>
        <div className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black shadow-sm">
          Showing {offerQueue.length} autograph{offerQueue.length !== 1 ? 's' : ''}
        </div>
      </div>

      {offerQueue.length === 0 ? (
        <div className="mt-8 rounded-[2rem] bg-white p-8 text-gray-600 shadow-sm">
          No incoming offers right now.
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {offerQueue.map((group) => {
            const headline = group.accepted ?? group.pending[0] ?? group.on_hold[0] ?? null;
            if (!headline) return null;

            return (
              <article key={group.autograph_id} className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
                <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
                  <div className="bg-[#1C1C1F]">
                    <Link href={`/app/listings/${group.autograph_id}`} className="block">
                      {group.autograph?.thumbnail_url ? (
                        <img
                          src={group.autograph.thumbnail_url}
                          alt={headline.creator_name}
                          className="aspect-[4/5] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[4/5] items-center justify-center text-sm font-semibold uppercase tracking-[0.25em] text-white/50">
                          TapnSign
                        </div>
                      )}
                    </Link>
                  </div>

                  <div className="p-7">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <Link
                          href={`/app/listings/${group.autograph_id}`}
                          className="text-2xl font-black text-black transition-colors hover:text-[#E53935]"
                        >
                          {headline.creator_name}
                          {headline.creator_sequence_number != null ? ` · #${headline.creator_sequence_number}` : ''}
                        </Link>
                        {group.autograph?.series_name ? (
                          <div className="mt-2 text-sm text-gray-600">
                            {group.autograph.series_name}
                            {group.autograph.series_sequence_number != null && group.autograph.series_max_size != null
                              ? ` · ${group.autograph.series_sequence_number} of ${group.autograph.series_max_size}`
                              : ''}
                          </div>
                        ) : null}
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                          Top Amount
                        </div>
                        <div className="mt-1 text-3xl font-black text-black">
                          {formatMoney(headline.amount_cents)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 space-y-2 text-sm text-gray-600">
                      {group.accepted ? (
                        <div>
                          <span className="font-semibold text-black">Awaiting Buyer Payment</span>
                          {' · '}
                          due {formatDateTime(group.accepted.payment_due_at)}
                        </div>
                      ) : null}

                      {group.pending.length > 0 ? (
                        <div>
                          <span className="font-semibold text-black">
                            {group.pending.length} active offer{group.pending.length !== 1 ? 's' : ''}
                          </span>
                          {' · '}
                          highest {formatMoney(group.pending[0].amount_cents)}
                          {group.pending[0].expires_at ? ` · Offer expires ${formatDateTime(group.pending[0].expires_at)}` : ''}
                        </div>
                      ) : null}

                      {group.on_hold.length > 0 ? (
                        <div>
                          <span className="font-semibold text-black">
                            {group.on_hold.length} backup offer{group.on_hold.length !== 1 ? 's' : ''}
                          </span>
                          {' · '}
                          preserved while payment is pending
                        </div>
                      ) : null}
                    </div>

                    {group.accepted ? (
                      <div className="mt-6 rounded-[1.5rem] bg-[#F6F6F7] px-5 py-4 text-sm leading-7 text-gray-600">
                        Backup offers are being held. If the accepted buyer does not complete payment within 24 hours, those offers will become active again automatically.
                      </div>
                    ) : group.pending[0] ? (
                      <div className="mt-6 flex flex-wrap gap-3">
                        <form action={respondOfferAction.bind(null, group.pending[0].id, 'accept')}>
                          <button
                            type="submit"
                            className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
                          >
                            Accept
                          </button>
                        </form>
                        <form action={respondOfferAction.bind(null, group.pending[0].id, 'decline')}>
                          <button
                            type="submit"
                            className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
                          >
                            Decline
                          </button>
                        </form>
                      </div>
                    ) : null}

                    {group.pending.length > 0 ? (
                      <div className="mt-6 rounded-[1.5rem] border border-gray-200 p-5">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                          Active Offers
                        </div>
                        <div className="mt-3 space-y-3">
                          {group.pending.map((offer) => (
                            <div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                              <div className="font-semibold text-black">{formatMoney(offer.amount_cents)}</div>
                              <div className="text-gray-500">
                                Offer expires {formatDateTime(offer.expires_at)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {group.on_hold.length > 0 ? (
                      <div className="mt-5 rounded-[1.5rem] border border-gray-200 p-5">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                          Backup Offers
                        </div>
                        <div className="mt-3 space-y-3">
                          {group.on_hold.map((offer) => (
                            <div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                              <div className="font-semibold text-black">{formatMoney(offer.amount_cents)}</div>
                              <div className="text-gray-500">On hold while another buyer completes payment</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}

          {nextCursor ? (
            <div className="flex justify-center pt-2">
              <Link
                href={`/app/me/offers?before_headline_amount=${encodeURIComponent(String(nextCursor.beforeHeadlineAmount))}&before_headline_created_at=${encodeURIComponent(nextCursor.beforeHeadlineCreatedAt)}&before_autograph_id=${encodeURIComponent(nextCursor.beforeAutographId)}`}
                className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
              >
                Load More
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

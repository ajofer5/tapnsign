import Link from 'next/link';
import { formatDateTime, formatMoney, getMyActivity, type WebsiteActivityEntry } from '../../../lib/me';
import { requireWebSessionUser } from '../../../lib/web-auth';

export const dynamic = 'force-dynamic';

const EVENT_LABELS: Record<WebsiteActivityEntry['type'], string> = {
  sold: 'Sold',
  purchased: 'Purchased',
  offer_received: 'Offer Received',
  offer_sent: 'Offer Sent',
  offer_on_hold: 'Offer On Hold',
  offer_accepted: 'Offer Accepted',
  offer_declined: 'Offer Declined',
  offer_withdrawn: 'Offer Withdrawn',
  offer_expired: 'Offer Expired',
};

export default async function ActivityPage() {
  const user = await requireWebSessionUser();
  const entries = await getMyActivity(user.id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Activity
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
            Your recent activity
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-gray-600">
            Track purchases, sales, and offer activity across your TapnSign account.
          </p>
        </div>
        <div className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black shadow-sm">
          Showing {entries.length} event{entries.length !== 1 ? 's' : ''}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="mt-8 rounded-[2rem] bg-white p-10 text-center shadow-sm">
          <h2 className="text-2xl font-black text-black">No activity yet</h2>
          <p className="mt-3 text-base text-gray-600">
            Once you buy, sell, or interact with offers, your account activity will show up here.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {entries.map((entry) => (
            <article key={entry.id} className="rounded-[1.75rem] bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                    {EVENT_LABELS[entry.type]}
                  </div>
                  <Link
                    href={entry.type === 'offer_accepted' && entry.offer_role === 'buyer' && !entry.accepted_transfer_id ? `/app/offers/${entry.id.replace('offer-', '')}/checkout` : `/app/listings/${entry.autograph_id}`}
                    className="mt-2 block text-xl font-black text-black transition-colors hover:text-[#E53935]"
                  >
                    {entry.creator_name}
                    {entry.creator_sequence_number != null ? ` · #${entry.creator_sequence_number}` : ''}
                  </Link>
                  {entry.series_name ? (
                    <div className="mt-1 text-sm text-gray-600">{entry.series_name}</div>
                  ) : null}
                  <div className="mt-3 text-sm leading-6 text-gray-600">
                    {renderActivityMeta(entry)}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-black text-black">{formatMoney(entry.amount_cents)}</div>
                  <div className="mt-1 text-sm text-gray-500">{formatDateTime(entry.date)}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function renderActivityMeta(entry: WebsiteActivityEntry) {
  if (entry.type === 'offer_received' && entry.expires_at) {
    return `Offer expires ${formatDateTime(entry.expires_at)}.`;
  }
  if (entry.type === 'offer_sent' && entry.expires_at) {
    return `Pending until ${formatDateTime(entry.expires_at)}.`;
  }
  if (entry.type === 'offer_on_hold' && entry.offer_role === 'buyer') {
    return 'Your offer is on hold while another buyer completes payment.';
  }
  if (entry.type === 'offer_on_hold' && entry.offer_role === 'owner') {
    return 'A backup offer is being held while the accepted buyer completes payment.';
  }
  if (entry.type === 'offer_accepted' && entry.offer_role === 'buyer' && entry.payment_due_at && !entry.accepted_transfer_id) {
    return `Accepted. Complete payment by ${formatDateTime(entry.payment_due_at)}.`;
  }
  if (entry.type === 'offer_accepted' && entry.offer_role === 'owner' && entry.payment_due_at && !entry.accepted_transfer_id) {
    return `Accepted. Awaiting buyer payment until ${formatDateTime(entry.payment_due_at)}.`;
  }
  if (entry.type === 'offer_declined') {
    return 'This offer was declined.';
  }
  if (entry.type === 'offer_withdrawn') {
    return 'This offer was withdrawn.';
  }
  if (entry.type === 'offer_expired') {
    return 'This offer expired.';
  }
  if (entry.type === 'sold') {
    return 'You sold this autograph.';
  }
  if (entry.type === 'purchased') {
    return 'You purchased this autograph.';
  }
  return 'Recent account activity.';
}

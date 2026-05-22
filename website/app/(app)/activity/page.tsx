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
  personalized_request_received: 'Personalized Request Received',
  personalized_request_sent: 'Personalized Request Sent',
  personalized_request_countered: 'Personalized Request Countered',
  personalized_request_accepted: 'Personalized Request Accepted',
  personalized_request_declined: 'Personalized Request Declined',
  personalized_request_withdrawn: 'Personalized Request Withdrawn',
  personalized_request_expired: 'Personalized Request Expired',
  personalized_request_fulfilled: 'Personalized Request Ready',
  personalized_request_completed: 'Personalized Request Complete',
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
            Track purchases, sales, offers, and personalized request activity across your Ophinia account.
          </p>
        </div>
        <div className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black shadow-sm">
          Showing {entries.length} event{entries.length !== 1 ? 's' : ''}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="web-panel mt-8 p-10 text-center">
          <h2 className="text-2xl font-black text-black">No activity yet</h2>
          <p className="mt-3 text-base text-gray-600">
            Once you buy, sell, or interact with offers, your account activity will show up here.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {entries.map((entry) => (
            <article key={entry.id} className="web-panel-tight p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                    {EVENT_LABELS[entry.type]}
                  </div>
                  <Link
                    href={getActivityHref(entry)}
                    className="mt-2 block text-xl font-black text-black transition-colors hover:text-[#001B5C]"
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
  if (entry.type === 'personalized_request_received' && entry.recipient_name) {
    return `New request for ${entry.recipient_name}. Review it in Personalized Requests.`;
  }
  if (entry.type === 'personalized_request_sent' && entry.recipient_name && entry.expires_at) {
    return `Awaiting creator response for ${entry.recipient_name} until ${formatDateTime(entry.expires_at)}.`;
  }
  if (entry.type === 'personalized_request_countered' && entry.recipient_name) {
    return `Counter received for ${entry.recipient_name}. Review the updated amount in Personalized Requests.`;
  }
  if (entry.type === 'personalized_request_accepted' && entry.recipient_name) {
    return `Accepted for ${entry.recipient_name}. The creator can now record the autograph.`;
  }
  if (entry.type === 'personalized_request_declined' && entry.recipient_name) {
    return `The personalized request for ${entry.recipient_name} was declined.`;
  }
  if (entry.type === 'personalized_request_withdrawn' && entry.recipient_name) {
    return `The personalized request for ${entry.recipient_name} was withdrawn.`;
  }
  if (entry.type === 'personalized_request_expired' && entry.recipient_name) {
    return `The personalized request for ${entry.recipient_name} expired.`;
  }
  if (entry.type === 'personalized_request_fulfilled' && entry.request_role === 'requester' && entry.payment_due_at) {
    return `Your personalized autograph is ready. Complete payment by ${formatDateTime(entry.payment_due_at)}.`;
  }
  if (entry.type === 'personalized_request_fulfilled' && entry.request_role === 'creator') {
    return 'Your personalized autograph has been recorded and is waiting on buyer payment.';
  }
  if (entry.type === 'personalized_request_completed' && entry.recipient_name) {
    return `Completed for ${entry.recipient_name}.`;
  }
  return 'Recent account activity.';
}

function getActivityHref(entry: WebsiteActivityEntry) {
  if (entry.type === 'offer_accepted' && entry.offer_role === 'buyer' && !entry.accepted_transfer_id) {
    return `/offers/${entry.id.replace('offer-', '')}/checkout`;
  }
  if (
    entry.type === 'personalized_request_fulfilled' &&
    entry.request_role === 'requester' &&
    entry.personalized_request_id &&
    !entry.completed_transfer_id
  ) {
    return `/personalized-requests/${entry.personalized_request_id}/checkout`;
  }
  if (entry.type.startsWith('personalized_request_')) {
    return '/personalized-requests';
  }
  if (entry.autograph_id) {
    return `/autograph/${entry.autograph_id}`;
  }
  return '/activity';
}

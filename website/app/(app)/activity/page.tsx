import Link from 'next/link';
import { formatDateTime, formatMoney, getMyActivity, type WebsiteActivityEntry } from '../../../lib/me';
import { requireWebSessionUser } from '../../../lib/web-auth';

export const dynamic = 'force-dynamic';

const EVENT_LABELS: Record<WebsiteActivityEntry['type'], string> = {
  personalized_request_received: 'Personalized Request Received',
  personalized_request_sent: 'Personalized Request Sent',
  personalized_request_countered: 'Personalized Request Countered',
  personalized_request_accepted: 'Personalized Request Accepted',
  personalized_request_declined: 'Personalized Request Declined',
  personalized_request_withdrawn: 'Personalized Request Withdrawn',
  personalized_request_expired: 'Personalized Request Expired',
  personalized_request_fulfilled: 'Personalized Request Ready',
  personalized_request_completed: 'Personalized Request Complete',
  print_ordered: 'Print Purchased',
  daily_print_summary: 'Prints Sold',
  verification_status: 'Verification',
  payout_status: 'Payout Account',
};

function formatPrintStatus(status?: string | null) {
  switch (status) {
    case 'payment_confirmed': return 'Payment confirmed.';
    case 'submitted': return 'Submitted to print partner.';
    case 'shipped': return 'Shipped.';
    case 'delivered': return 'Delivered.';
    case 'failed': return 'Fulfillment needs attention.';
    case 'pending': return 'Pending.';
    default: return 'Print order received.';
  }
}

function formatVerificationStatus(status?: string | null) {
  switch (status) {
    case 'verified': return 'Your account verification is complete.';
    case 'pending': return 'Your account verification is pending.';
    case 'failed': return 'Your account verification needs attention.';
    case 'expired': return 'Your verification session expired.';
    default: return 'Verification is not complete yet.';
  }
}

function formatPayoutStatus(status?: string | null) {
  switch (status) {
    case 'connected': return 'Your payout account is connected.';
    case 'in_progress': return 'Your payout setup is in progress.';
    default: return 'Connect payouts to receive print earnings.';
  }
}

function formatActivityDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'on that date';
  const now = new Date();
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - localDate.getTime()) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default async function ActivityPage() {
  const user = await requireWebSessionUser();
  const entries = await getMyActivity(user.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">Activity</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-black">Your Activity</h1>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-[6px] border border-gray-200 bg-white p-10 text-center">
          <h2 className="text-xl font-black text-black">No activity yet</h2>
          <p className="mt-3 text-sm text-gray-600">
            Once you order prints or manage your account, activity will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const showAutographLine = entry.type !== 'verification_status' && entry.type !== 'payout_status';
            return (
              <article key={entry.id} className="rounded-[6px] border border-gray-200 bg-white px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-gray-500">
                      {EVENT_LABELS[entry.type] ?? entry.type}
                    </div>
                    {showAutographLine && entry.autograph_id ? (
                      <Link
                        href={`/autograph/${entry.autograph_id}`}
                        className="mt-1 block text-base font-black text-black transition-colors hover:text-[#001B5C]"
                      >
                        {entry.creator_name}
                        {entry.creator_sequence_number != null ? ` · #${entry.creator_sequence_number}` : ''}
                      </Link>
                    ) : showAutographLine ? (
                      <div className="mt-1 text-base font-black text-black">
                        {entry.creator_name}
                        {entry.creator_sequence_number != null ? ` · #${entry.creator_sequence_number}` : ''}
                      </div>
                    ) : null}
                    {entry.series_name ? (
                      <div className="mt-0.5 text-xs text-gray-500">{entry.series_name}</div>
                    ) : null}
                    <div className="mt-1.5 text-sm text-gray-600">
                      {renderActivityMeta(entry)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {entry.amount_cents > 0 ? (
                      <div className="text-base font-black text-black">{formatMoney(entry.amount_cents)}</div>
                    ) : null}
                    <div className="mt-0.5 text-xs text-gray-400">{formatDateTime(entry.date)}</div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function renderActivityMeta(entry: WebsiteActivityEntry): string {
  if (entry.type === 'personalized_request_received' && entry.recipient_name) {
    return `New request for ${entry.recipient_name}.`;
  }
  if (entry.type === 'personalized_request_sent' && entry.recipient_name && entry.expires_at) {
    return `Pending for ${entry.recipient_name} until ${formatDateTime(entry.expires_at)}.`;
  }
  if (entry.type === 'personalized_request_countered' && entry.recipient_name) {
    return `Counter received for ${entry.recipient_name}.`;
  }
  if (entry.type === 'personalized_request_accepted' && entry.recipient_name) {
    return `Accepted for ${entry.recipient_name}.`;
  }
  if (entry.type === 'personalized_request_declined' && entry.recipient_name) {
    return `Declined for ${entry.recipient_name}.`;
  }
  if (entry.type === 'personalized_request_withdrawn' && entry.recipient_name) {
    return `Withdrawn for ${entry.recipient_name}.`;
  }
  if (entry.type === 'personalized_request_expired' && entry.recipient_name) {
    return `Expired for ${entry.recipient_name}.`;
  }
  if (entry.type === 'personalized_request_fulfilled' && entry.request_role === 'requester' && entry.payment_due_at) {
    return `Ready for payment until ${formatDateTime(entry.payment_due_at)}.`;
  }
  if (entry.type === 'personalized_request_fulfilled' && entry.request_role === 'creator') {
    return 'Recorded and waiting on buyer payment.';
  }
  if (entry.type === 'personalized_request_completed' && entry.recipient_name) {
    return `Completed for ${entry.recipient_name}.`;
  }
  if (entry.type === 'print_ordered') {
    const qty = entry.print_quantity ?? 1;
    return `${qty > 1 ? `${qty} prints` : '1 print'} · ${formatPrintStatus(entry.fulfillment_status)}`;
  }
  if (entry.type === 'daily_print_summary') {
    const qty = entry.print_quantity ?? 0;
    return `Printed ${qty} ${qty === 1 ? 'time' : 'times'} ${formatActivityDay(entry.date)}.`;
  }
  if (entry.type === 'verification_status') {
    return formatVerificationStatus(entry.status);
  }
  if (entry.type === 'payout_status') {
    return formatPayoutStatus(entry.status);
  }
  return '';
}

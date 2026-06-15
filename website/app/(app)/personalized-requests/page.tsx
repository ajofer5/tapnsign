import Link from 'next/link';
import { formatDateTime, formatMoney } from '../../../lib/me';
import { getMyPersonalizedRequests } from '../../../lib/personalized-requests';
import { requireWebSessionUser } from '../../../lib/web-auth';

type RequestListItem = Awaited<ReturnType<typeof getMyPersonalizedRequests>>['incoming'][number];

export const dynamic = 'force-dynamic';

export default async function PersonalizedRequestsPage() {
  const user = await requireWebSessionUser();
  const { incoming, outgoing } = await getMyPersonalizedRequests(user.id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Personalized Requests
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
            Private autograph commissions
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-gray-600">
            Track personalized print requests across both sides of the transaction. Creator-side recording still continues in the mobile app.
          </p>
        </div>
        <div className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black shadow-sm">
          {incoming.length + outgoing.length} total request{incoming.length + outgoing.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-black text-black">Requests For You</h2>
            <span className="text-sm text-gray-500">{incoming.length}</span>
          </div>
          <div className="space-y-4">
            {incoming.length === 0 ? (
              <EmptyCard message="No incoming personalized requests yet." />
            ) : (
              incoming.map((request) => (
                <RequestCard key={request.id} request={request} role="creator" />
              ))
            )}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-black text-black">Your Requests</h2>
            <span className="text-sm text-gray-500">{outgoing.length}</span>
          </div>
          <div className="space-y-4">
            {outgoing.length === 0 ? (
              <EmptyCard message="No outgoing personalized requests yet." />
            ) : (
              outgoing.map((request) => (
                <RequestCard key={request.id} request={request} role="requester" />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function RequestCard({
  request,
  role,
}: {
  request: RequestListItem;
  role: 'creator' | 'requester';
}) {
  const checkoutHref =
    role === 'requester' &&
    request.status === 'fulfilled'
      ? `/personalized-requests/${request.id}/checkout`
      : null;

  return (
    <article className="web-panel-tight p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
            {getStatusLabel(request.status)}
          </div>
          <div className="mt-2 text-xl font-black text-black">
            {role === 'creator'
              ? `${request.requester_name} → ${request.recipient_name}`
              : `${request.creator_name} for ${request.recipient_name}`}
          </div>
          {request.inscription_text ? (
            <div className="mt-2 text-sm text-gray-600">
              Inscription: {request.inscription_text}
            </div>
          ) : null}
          {request.requester_note ? (
            <div className="mt-1 text-sm text-gray-600">
              Note: {request.requester_note}
            </div>
          ) : null}
          <div className="mt-3 text-sm leading-6 text-gray-600">
            {getRequestMeta(request, role)}
          </div>
        </div>

        <div className="text-right">
          <div className="text-2xl font-black text-black">{formatMoney(request.amount_cents)}</div>
          <div className="mt-1 text-sm text-gray-500">{formatDateTime(request.created_at)}</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {checkoutHref ? (
          <Link
            href={checkoutHref}
            className="rounded-lg bg-[#001B5C] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#00144A]"
          >
            Complete Payment
          </Link>
        ) : null}
        {request.autograph_certificate_id ? (
          <Link
            href={`/verify/${request.autograph_certificate_id}`}
            className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
          >
            View Certificate
          </Link>
        ) : null}
        {role === 'creator' && request.status === 'accepted' ? (
          <div className="rounded-lg border border-dashed border-gray-300 px-5 py-3 text-sm font-semibold text-gray-600">
            Open the Ophinia app to record this autograph.
          </div>
        ) : null}
      </div>
    </article>
  );
}

function getRequestMeta(
  request: RequestListItem,
  role: 'creator' | 'requester',
) {
  if (request.status === 'pending') {
    return role === 'creator'
      ? `Awaiting your response until ${formatDateTime(request.expires_at)}.`
      : `Waiting for creator response until ${formatDateTime(request.expires_at)}.`;
  }
  if (request.status === 'countered') {
    return role === 'requester'
      ? `Counter received. Review the updated amount before ${formatDateTime(request.expires_at)}.`
      : `Counter sent. Waiting for collector response until ${formatDateTime(request.expires_at)}.`;
  }
  if (request.status === 'accepted') {
    return role === 'creator'
      ? 'Accepted. Record the personalized print in the app to finish fulfillment.'
      : 'Accepted. The creator can now record your personalized print.';
  }
  if (request.status === 'declined') {
    return 'This request was declined.';
  }
  if (request.status === 'withdrawn') {
    return 'This request was withdrawn.';
  }
  if (request.status === 'expired') {
    return 'This request expired before it could be completed.';
  }
  if (request.status === 'fulfilled' && request.payment_due_at) {
    return role === 'requester'
      ? `Ready for payment until ${formatDateTime(request.payment_due_at)}.`
      : `Recorded and waiting on buyer payment until ${formatDateTime(request.payment_due_at)}.`;
  }
  if (request.status === 'completed') {
    return 'Completed successfully.';
  }
  return 'Recent personalized request activity.';
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'countered':
      return 'Countered';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'withdrawn':
      return 'Withdrawn';
    case 'expired':
      return 'Expired';
    case 'fulfilled':
      return 'Ready';
    case 'completed':
      return 'Completed';
    default:
      return 'Request';
  }
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="web-panel-tight p-8 text-sm text-gray-600">
      {message}
    </div>
  );
}

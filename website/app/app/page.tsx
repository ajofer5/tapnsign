import Link from 'next/link';
import { getWebSessionUser } from '../../lib/web-auth';

export const dynamic = 'force-dynamic';

export default async function WebAppHomePage() {
  const user = await getWebSessionUser();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <section className="rounded-[2rem] bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
          TapnSign Web
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-black md:text-5xl">
          Welcome back, {user?.display_name ?? 'TapnSign Member'}.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
          Browse, collect, manage listings, and stay on top of your offers from the same TapnSign account you use in the app.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink href="/marketplace" label="Browse Listings" tone="primary" />
          <QuickLink href="/app/collection" label="Collection" />
          <QuickLink href="/app/saved" label="Saved" />
          <QuickLink href="/app/me/listings" label="My Listings" />
          <QuickLink href="/app/me/offers" label="Offer Queue" />
          <QuickLink href="/verify/demo" label="Certificate Example" />
        </div>
      </section>

      <section className="mt-8 rounded-[2rem] bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
          Account Snapshot
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard label="Display Name" value={user?.display_name ?? '—'} />
          <DetailCard label="Email" value={user?.email ?? '—'} />
          <DetailCard label="Role" value={user?.role ?? '—'} />
          <DetailCard label="Verification" value={user?.verification_status ?? '—'} />
        </div>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <FeatureCard
          title="Secure Checkout"
          body="Complete fixed-price purchases on the web with the same TapnSign account you use in the app."
        />
        <FeatureCard
          title="Offer Flow"
          body="Send offers, wait for seller response, and continue into payment when an offer is accepted."
        />
        <FeatureCard
          title="Seller Listings"
          body="Update listing mode, price, and automatic offer rules from the same signed-in workspace."
        />
        <FeatureCard
          title="Collection"
          body="Review the autographs you own before deciding what to keep, list, or revisit later."
        />
        <FeatureCard
          title="Offer Queue"
          body="Accept or decline the top active offer on each autograph while backup offers stay preserved on hold."
        />
      </section>
    </div>
  );
}

function QuickLink({
  href,
  label,
  tone = 'default',
}: {
  href: string;
  label: string;
  tone?: 'default' | 'primary';
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl px-5 py-4 text-sm font-semibold transition-colors ${
        tone === 'primary'
          ? 'bg-[#E53935] text-white hover:bg-[#cf302d]'
          : 'border border-gray-200 bg-[#F7F7F8] text-black hover:border-black hover:bg-white'
      }`}
    >
      {label}
    </Link>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#F7F7F8] px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-black">{value}</div>
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.75rem] bg-white p-7 shadow-sm">
      <h2 className="text-xl font-black text-black">{title}</h2>
      <p className="mt-3 text-base leading-7 text-gray-600">{body}</p>
    </div>
  );
}

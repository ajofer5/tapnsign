import Link from 'next/link';
import { getWebSessionUser } from '../../../lib/web-auth';
import { webRouteToProfile, webRoutes } from '../../../lib/routes';

export const dynamic = 'force-dynamic';

export default async function WebAppHomePage() {
  const user = await getWebSessionUser();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <section className="web-panel p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
          Ophinia Web
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-black md:text-5xl">
          Welcome back, {user?.display_name ?? 'Ophinia Member'}.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
          Browse, collect, manage listings, and stay on top of your offers from the same Ophinia account you use in the app.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink href={webRoutes.marketplace} label="Browse Listings" tone="primary" />
          {user?.id ? <QuickLink href={webRouteToProfile(user.id)} label="View My Profile" /> : null}
          <QuickLink href={webRoutes.collection} label="Collection" />
          <QuickLink href={webRoutes.saved} label="Saved" />
          <QuickLink href={webRoutes.myListings} label="My Listings" />
          <QuickLink href={webRoutes.myOffers} label="Offer Queue" />
          <QuickLink href={webRoutes.certificateExample} label="Certificate Example" />
        </div>
      </section>

      <section className="web-panel mt-8 p-7">
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
          body="Complete fixed-price purchases on the web with the same Ophinia account you use in the app."
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
      className={`rounded-lg px-5 py-4 text-sm font-semibold transition-colors ${
        tone === 'primary'
          ? 'bg-[#001B5C] text-white hover:bg-[#00144A]'
          : 'border border-gray-200 bg-[#F7F7F8] text-black hover:border-black hover:bg-white'
      }`}
    >
      {label}
    </Link>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#F7F7F8] px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-black">{value}</div>
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="web-panel-tight p-7">
      <h2 className="text-xl font-black text-black">{title}</h2>
      <p className="mt-3 text-base leading-7 text-gray-600">{body}</p>
    </div>
  );
}

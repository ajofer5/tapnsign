import Link from 'next/link';
import { getWebSessionUser } from '../../lib/web-session';

export const dynamic = 'force-dynamic';

export default async function WebAppHomePage() {
  const user = await getWebSessionUser();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        <section className="rounded-[2rem] bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            TapnSign
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black md:text-5xl">
            Browse, collect, and manage your autographs online.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-600">
            TapnSign on the web gives buyers and collectors a clean place to browse listings, manage saved items, review offers, and complete secure checkout.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/marketplace"
              className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
            >
              Browse Listings
            </Link>
            <Link
              href="/app/me/listings"
              className="rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
            >
              My Listings
            </Link>
            <Link
              href="/app/collection"
              className="rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
            >
              Collection
            </Link>
            <Link
              href="/app/saved"
              className="rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
            >
              Saved
            </Link>
            <Link
              href="/app/me/offers"
              className="rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
            >
              Offer Queue
            </Link>
            <Link
              href="/verify/demo"
              className="rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
            >
              Certificate Example
            </Link>
          </div>
        </section>

        <aside className="rounded-[2rem] bg-[#18181A] p-8 text-white shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
            Your Account
          </p>
          <div className="mt-5 space-y-4 text-sm">
            <Detail label="Display Name" value={user?.display_name ?? '—'} />
            <Detail label="Email" value={user?.email ?? '—'} />
            <Detail label="Role" value={user?.role ?? '—'} />
            <Detail label="Verification" value={user?.verification_status ?? '—'} />
          </div>
        </aside>
      </div>

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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
      <span className="text-white/60">{label}</span>
      <span className="max-w-[65%] text-right font-medium">{value}</span>
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

import Link from 'next/link';
import { WebListingCard } from '../../components/web-listing-card';
import { getMarketplaceListings } from '../../lib/marketplace';
import { getWebSessionUser } from '../../lib/web-auth';
import { getSavedAutographIds } from '../../lib/watchlist';

export const dynamic = 'force-dynamic';

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams?: { before_created_at?: string; before_id?: string };
}) {
  const user = await getWebSessionUser();
  const page = await getMarketplaceListings(
    user?.id ?? null,
    48,
    searchParams?.before_created_at && searchParams?.before_id
      ? {
          beforeCreatedAt: searchParams.before_created_at,
          beforeId: searchParams.before_id,
        }
      : null,
  );
  const listings = page.listings;
  const savedIds = user
    ? await getSavedAutographIds(user.id, listings.map((listing) => listing.id))
    : new Set<string>();

  return (
    <main className="min-h-screen bg-[#F2F2F4]">
      <nav className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
          <Link href="/" className="text-lg font-black text-[#E53935]">
            TapnSign
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">Marketplace</span>
            {user ? (
              <Link href="/app" className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
                My App
              </Link>
            ) : (
              <>
                <Link href="/login?next=%2Fmarketplace" className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
                  Sign In
                </Link>
                <Link href="/signup?next=%2Fmarketplace" className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
                  Create Account
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <section className="rounded-[2rem] bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Marketplace
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black md:text-5xl">
            Browse verified digital autographs.
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-gray-600">
            Discover creator listings, inspect their certificates, and buy or make an offer with the same TapnSign account you use in the app.
          </p>
        </section>

        {listings.length > 0 ? (
          <>
            <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {listings.map((listing) => (
                <WebListingCard
                  key={listing.id}
                  listing={listing}
                  isSaved={savedIds.has(listing.id)}
                  savePath="/marketplace"
                />
              ))}
            </section>
            {page.nextCursor ? (
              <div className="mt-8 flex justify-center">
                <Link
                  href={`/marketplace?before_created_at=${encodeURIComponent(page.nextCursor.beforeCreatedAt)}&before_id=${encodeURIComponent(page.nextCursor.beforeId)}`}
                  className="rounded-full border border-black px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
                >
                  Load More
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-8 rounded-[2rem] bg-white p-10 text-center shadow-sm">
            <h2 className="text-2xl font-black text-black">No active listings</h2>
            <p className="mt-3 text-base text-gray-600">
              Check back soon for newly listed autographs.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

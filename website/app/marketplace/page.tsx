import Link from 'next/link';
import Image from 'next/image';
import { WebListingCard } from '../../components/web-listing-card';
import { getMarketplaceListings } from '../../lib/marketplace';
import { getWebSessionUser } from '../../lib/web-auth';
import { getSavedAutographIds } from '../../lib/watchlist';
import { webRoutes, withNext, withParams } from '../../lib/routes';

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
          <Link href={webRoutes.landing}>
            <Image src="/ophinia-logo.png" alt="Ophinia" width={120} height={32} className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-4">
            {user ? (
              <Link href={webRoutes.home} className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
                My App
              </Link>
            ) : (
              <>
                <Link href={withNext(webRoutes.login, webRoutes.marketplace)} className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
                  Sign In
                </Link>
                <Link href={withNext(webRoutes.signup, webRoutes.marketplace)} className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
                  Create Account
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <section className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Marketplace
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-black md:text-4xl">
              Official autograph prints
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-gray-600 md:text-base">
            Browse authenticated autographs and order official physical prints where available.
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
                  savePath={webRoutes.marketplace}
                />
              ))}
            </section>
            {page.nextCursor ? (
              <div className="mt-8 flex justify-center">
                <Link
                  href={withParams(webRoutes.marketplace, {
                    before_created_at: page.nextCursor.beforeCreatedAt,
                    before_id: page.nextCursor.beforeId,
                  })}
                  className="rounded-lg border border-black px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
                >
                  Load More
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <div className="web-panel mt-8 p-10 text-center">
            <h2 className="text-2xl font-black text-black">No public prints</h2>
            <p className="mt-3 text-base text-gray-600">
              Check back soon for newly enabled official prints.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

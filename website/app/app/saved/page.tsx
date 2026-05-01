import Link from 'next/link';
import { WebListingCard } from '../../../components/web-listing-card';
import { requireWebSessionUser } from '../../../lib/web-auth';
import { getSavedListings } from '../../../lib/watchlist';

export const dynamic = 'force-dynamic';

type SavedPageProps = {
  searchParams?: Promise<{
    before_saved_at?: string;
    before_autograph_id?: string;
  }>;
};

export default async function SavedPage({ searchParams }: SavedPageProps) {
  const user = await requireWebSessionUser();
  const params = (await searchParams) ?? {};
  const cursor =
    params.before_saved_at && params.before_autograph_id
      ? {
          beforeSavedAt: params.before_saved_at,
          beforeAutographId: params.before_autograph_id,
        }
      : null;
  const { listings, nextCursor } = await getSavedListings(user.id, 24, cursor);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Saved
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
            Your saved autographs
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-gray-600">
            Revisit listings you want to watch closely, then jump back into a purchase or offer flow when you are ready.
          </p>
        </div>
        <div className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black shadow-sm">
          Showing {listings.length} saved item{listings.length !== 1 ? 's' : ''}
        </div>
      </div>

      {listings.length > 0 ? (
        <>
          <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {listings.map((listing) => (
              <WebListingCard
                key={listing.id}
                listing={listing}
                isSaved
                savePath="/app/saved"
              />
            ))}
          </section>

          {nextCursor ? (
            <div className="mt-8 flex justify-center">
              <Link
                href={`/app/saved?before_saved_at=${encodeURIComponent(nextCursor.beforeSavedAt)}&before_autograph_id=${encodeURIComponent(nextCursor.beforeAutographId)}`}
                className="rounded-xl border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
              >
                Load More
              </Link>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-8 rounded-[2rem] bg-white p-10 text-center shadow-sm">
          <h2 className="text-2xl font-black text-black">No saved autographs yet</h2>
          <p className="mt-3 text-base text-gray-600">
            Save listings from the marketplace or listing pages and they will show up here.
          </p>
        </div>
      )}
    </div>
  );
}

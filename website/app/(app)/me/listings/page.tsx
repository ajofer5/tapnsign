import Link from 'next/link';
import { getMyListings } from '../../../../lib/me';
import { requireWebSessionUser } from '../../../../lib/web-auth';
import { saveListingAction } from './actions';

export const dynamic = 'force-dynamic';

type MyListingsPageProps = {
  searchParams?: Promise<{
    before_created_at?: string;
    before_id?: string;
  }>;
};

export default async function MyListingsPage({ searchParams }: MyListingsPageProps) {
  const user = await requireWebSessionUser();
  const params = (await searchParams) ?? {};
  const cursor =
    params.before_created_at && params.before_id
      ? {
          beforeCreatedAt: params.before_created_at,
          beforeId: params.before_id,
        }
      : null;
  const { listings, nextCursor } = await getMyListings(user.id, 24, cursor);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Print Settings
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
            My Prints
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-gray-600">
            Choose which creator-owned autographs can be ordered as official physical prints.
          </p>
        </div>
        <div className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black shadow-sm">
          Showing {listings.length} autograph{listings.length !== 1 ? 's' : ''}
        </div>
      </div>

      {listings.length === 0 ? (
        <div className="web-panel mt-8 p-8 text-gray-600">
          You do not have any autographs in your collection yet.
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {listings.map((listing) => (
            <article key={listing.id} className="web-panel overflow-hidden">
              <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
                <div className="bg-[#1C1C1F]">
                  <Link href={`/autograph/${listing.id}`} className="block">
                    {listing.thumbnail_url ? (
                      <img
                        src={listing.thumbnail_url}
                        alt={listing.creator_name}
                        className="aspect-[4/5] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/5] items-center justify-center text-sm font-semibold uppercase tracking-[0.25em] text-white/50">
                        Ophinia
                      </div>
                    )}
                  </Link>
                </div>

                <div className="p-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <Link
                        href={`/autograph/${listing.id}`}
                        className="text-2xl font-black text-black transition-colors hover:text-[#001B5C]"
                      >
                        {listing.creator_name}
                        {listing.creator_sequence_number != null ? ` · #${listing.creator_sequence_number}` : ''}
                      </Link>
                      {listing.series_name ? (
                        <div className="mt-2 text-sm text-gray-600">
                          {listing.series_name}
                          {listing.series_sequence_number != null && listing.series_max_size != null
                            ? ` · ${listing.series_sequence_number} of ${listing.series_max_size}`
                            : ''}
                        </div>
                      ) : (
                        <div className="mt-2 text-sm text-transparent">Series</div>
                      )}
                    </div>
                    <div className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                      {listing.prints_enabled ? 'Prints Enabled' : 'Prints Disabled'}
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-2">
                    <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
                      Current
                    </div>
                    <div className="text-3xl font-black text-black">
                      {listing.prints_enabled ? 'Public Prints On' : 'Public Prints Off'}
                    </div>
                    <div className="text-sm text-gray-500">
                      Certificate {listing.certificate_id}
                    </div>
                  </div>

                  <form action={saveListingAction.bind(null, listing.id)} className="mt-7 space-y-5">
                    {listing.creator_id === user.id ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="flex items-start gap-3 rounded-lg bg-[#F7F7F8] px-4 py-4 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            name="prints_enabled"
                            defaultChecked={listing.prints_enabled}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                          />
                          <span>Allow fans to buy official prints of this autograph.</span>
                        </label>

                        <label className="block rounded-lg bg-[#F7F7F8] px-4 py-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                            Print Limit
                          </div>
                          <input
                            type="text"
                            name="print_limit"
                            defaultValue={typeof listing.print_limit === 'number' ? String(listing.print_limit) : ''}
                            placeholder="Unlimited"
                            className="mt-2 w-full rounded-lg border border-transparent bg-white px-4 py-3 text-sm font-medium text-black outline-none transition-colors placeholder:text-gray-400 focus:border-[#001B5C]"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-[#F7F7F8] px-4 py-4 text-sm leading-7 text-gray-700">
                        Only the original creator can enable public print ordering for this autograph.
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        className="rounded-lg bg-[#001B5C] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#00144A]"
                      >
                        Save Print Settings
                      </button>
                      <Link
                        href={`/autograph/${listing.id}`}
                        className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
                      >
                        View Autograph
                      </Link>
                    </div>
                  </form>
                </div>
              </div>
            </article>
          ))}

          {nextCursor ? (
            <div className="flex justify-center pt-2">
              <Link
                href={`/me/listings?before_created_at=${encodeURIComponent(nextCursor.beforeCreatedAt)}&before_id=${encodeURIComponent(nextCursor.beforeId)}`}
                className="rounded-lg border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
              >
                Load More
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

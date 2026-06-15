import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  formatDate,
  getWebsiteListing,
} from '../../../lib/listings';
import { toggleWatchlistAction } from '../../../app/actions/watchlist';
import { getWebSessionUser } from '../../../lib/web-auth';
import { getSavedAutographIds } from '../../../lib/watchlist';

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getWebSessionUser();
  const listing = await getWebsiteListing(id, user?.id ?? null);
  if (!listing) notFound();
  const savedIds = user ? await getSavedAutographIds(user.id, [listing.id]) : new Set<string>();
  const isSaved = savedIds.has(listing.id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="web-panel p-5">
          <div className="overflow-hidden rounded-[14px] bg-black">
            <video
              src={listing.video_url}
              poster={listing.thumbnail_url ?? undefined}
              controls
              playsInline
              className="aspect-[4/5] w-full object-cover"
            />
          </div>
        </section>

        <section className="web-panel p-8">
          <h1 className="text-4xl font-black tracking-tight text-black">
            {listing.creator?.display_name ?? 'Creator'}
            {listing.creator_sequence_number != null ? ` · #${listing.creator_sequence_number}` : ''}
          </h1>
          {listing.series_name ? (
            <p className="mt-2 text-base text-gray-600">
              {listing.series_name}
              {listing.series_sequence_number != null && listing.series_max_size != null
                ? ` · ${listing.series_sequence_number} of ${listing.series_max_size}`
                : ''}
            </p>
          ) : null}

          <div className="web-panel-inset mt-8 p-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Official Print
                </div>
                <div className="mt-2 text-4xl font-black text-black">
                  {listing.prints_enabled ? 'Prints Available' : 'View Only'}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <form action={toggleWatchlistAction.bind(null, listing.id, isSaved, `/autograph/${listing.id}`)}>
                  <button
                    type="submit"
                    className="rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
                  >
                    {isSaved ? 'Saved' : 'Save'}
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="space-y-4 text-sm text-gray-700">
              <Detail label="Captured" value={formatDate(listing.created_at)} />
              <Detail label="Creator verified" value={listing.creator?.verified ? 'Yes' : 'No'} />
            </div>
            <div className="space-y-3">
              <Link
                href={`/verify/${listing.certificate_id}`}
                className="block rounded-full border border-gray-300 px-5 py-3 text-center text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
              >
                View Certificate
              </Link>
              {listing.creator_id ? (
                <Link
                  href={`/profile/${listing.creator_id}`}
                  className="block rounded-full border border-gray-300 px-5 py-3 text-center text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
                >
                  Creator Profile
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-3">
      <span className="text-gray-500">{label}</span>
      <span className="max-w-[62%] text-right font-medium text-black">{value}</span>
    </div>
  );
}

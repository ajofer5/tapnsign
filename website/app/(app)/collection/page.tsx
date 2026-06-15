import Link from 'next/link';
import { getMyListings } from '../../../lib/me';
import { requireWebSessionUser } from '../../../lib/web-auth';
import { webRouteToAutograph } from '../../../lib/routes';
import { CollectionPrintsToggle } from '../../../components/collection-prints-toggle';

export const dynamic = 'force-dynamic';

function formatCardDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
}

function formatSeriesEdition(item: {
  series_sequence_number: number | null;
  series_max_size: number | null;
}) {
  if (item.series_sequence_number == null) return null;
  if (item.series_max_size == null) return `#${item.series_sequence_number}`;
  return `${item.series_sequence_number} of ${item.series_max_size}`;
}

type CollectionPageProps = {
  searchParams?: Promise<{
    before_created_at?: string;
    before_id?: string;
  }>;
};

export default async function CollectionPage({ searchParams }: CollectionPageProps) {
  const user = await requireWebSessionUser();
  const params = (await searchParams) ?? {};
  const cursor =
    params.before_created_at && params.before_id
      ? {
          beforeCreatedAt: params.before_created_at,
          beforeId: params.before_id,
        }
      : null;
  const { listings: autographs, nextCursor } = await getMyListings(user.id, 24, cursor);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
            Collection
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-black">
            Your Autographs
          </h1>
        </div>
        {autographs.length > 0 && (
          <div className="text-sm font-medium text-gray-500">
            {autographs.length} autograph{autographs.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {autographs.length > 0 ? (
        <div className="space-y-3">
          {autographs.map((item) => {
            const isCreator = item.creator_id === user.id;
            const seqDate = [
              item.creator_sequence_number != null ? `#${item.creator_sequence_number}` : null,
              formatCardDate(item.created_at),
            ].filter(Boolean).join(' · ');
            const seriesLine = [item.series_name, formatSeriesEdition(item)]
              .filter(Boolean)
              .join(' · ');

            return (
              <article
                key={item.id}
                className="flex items-center gap-4 rounded-[6px] border border-gray-200 bg-white px-4 py-3"
              >
                {/* Thumbnail */}
                <Link
                  href={webRouteToAutograph(item.id)}
                  className="shrink-0 overflow-hidden rounded-[4px] bg-[#1C1C1F]"
                  style={{ width: 52 }}
                >
                  {item.thumbnail_url ? (
                    <img
                      src={item.thumbnail_url}
                      alt={item.creator_name}
                      className="aspect-[3/5] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[3/5] w-full items-center justify-center text-[7px] font-bold uppercase tracking-widest text-white/40">
                      —
                    </div>
                  )}
                </Link>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={webRouteToAutograph(item.id)}
                    className="block text-sm font-black leading-5 text-black transition-colors hover:text-[#001B5C]"
                  >
                    {item.creator_name}
                  </Link>
                  <div className="mt-0.5 text-xs text-gray-500">{seqDate}</div>
                  {seriesLine ? (
                    <div className="mt-0.5 truncate text-xs text-gray-400">{seriesLine}</div>
                  ) : null}
                  <div className="mt-0.5 text-xs text-gray-400">
                    Printed {item.print_count ?? 0} {(item.print_count ?? 0) === 1 ? 'time' : 'times'}
                  </div>
                </div>

                {/* Action */}
                <div className="shrink-0">
                  {isCreator ? (
                    <CollectionPrintsToggle
                      autographId={item.id}
                      enabled={item.prints_enabled}
                    />
                  ) : (
                    <Link
                      href={webRouteToAutograph(item.id)}
                      className="rounded-[4px] border border-gray-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
                    >
                      View
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[6px] border border-gray-200 bg-white p-10 text-center">
          <h2 className="text-xl font-black text-black">No autographs yet</h2>
          <p className="mt-3 text-sm text-gray-600">
            Capture or collect autographs and they will appear here.
          </p>
        </div>
      )}

      {autographs.length > 0 && nextCursor ? (
        <div className="mt-8 flex justify-center">
          <Link
            href={`/collection?before_created_at=${encodeURIComponent(nextCursor.beforeCreatedAt)}&before_id=${encodeURIComponent(nextCursor.beforeId)}`}
            className="rounded-lg border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
          >
            Load More
          </Link>
        </div>
      ) : null}
    </div>
  );
}

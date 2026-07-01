import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWebsiteListing } from '../../../lib/listings';
import { getWebSessionUser } from '../../../lib/web-auth';

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getWebSessionUser();
  const listing = await getWebsiteListing(id, user?.id ?? null);
  if (!listing) notFound();

  return (
    <div className="mx-auto max-w-sm px-6 py-10">
      <div className="overflow-hidden bg-black">
        <img
          src={listing.print_preview_url ?? listing.thumbnail_url ?? undefined}
          alt="Moment"
          className="aspect-[3/5] w-full object-cover"
        />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Link
          href={`/verify/${listing.certificate_id}`}
          className="block rounded-lg border border-gray-300 px-5 py-3 text-center text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
        >
          View Certificate
        </Link>
      </div>
    </div>
  );
}

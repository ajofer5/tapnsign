import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintPreviewButton } from '../../../components/print-preview-button';
import { getWebsiteListing } from '../../../lib/listings';
import { getWebSessionUser } from '../../../lib/web-auth';

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getWebSessionUser();
  const listing = await getWebsiteListing(id, user?.id ?? null);
  if (!listing) notFound();

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <div className="overflow-hidden bg-black">
        <img
          src={listing.print_preview_url ?? listing.thumbnail_url ?? undefined}
          alt="Moment"
          className="w-full h-auto block"
        />
      </div>

      <div className="mt-4 flex gap-2">
        <Link
          href={`/verify/${listing.certificate_id}`}
          className="flex-1 block rounded-lg border border-gray-300 px-5 py-3 text-center text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
        >
          View Certificate
        </Link>
        {listing.prints_enabled && (
          <PrintPreviewButton
            autographId={listing.id}
            className="flex-1 rounded-lg bg-[#001B5C] px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#00144A]"
          />
        )}
      </div>
    </div>
  );
}

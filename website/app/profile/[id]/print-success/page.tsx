import Link from 'next/link';
import Image from 'next/image';
import { webRoutes } from '../../../../lib/routes';

export default async function PrintSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session_id?: string; order_id?: string }>;
}) {
  const { id } = await params;
  const { session_id, order_id } = await searchParams;

  let fulfilled = false;
  let errorMessage: string | null = null;

  if (session_id && order_id) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/print-fulfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id, order_id }),
        cache: 'no-store',
      });
      const data = await response.json();
      if (response.ok && data.success) {
        fulfilled = true;
      } else {
        errorMessage = data.error ?? 'Order fulfillment failed.';
      }
    } catch (err: any) {
      errorMessage = err.message ?? 'Unexpected error during fulfillment.';
    }
  } else {
    errorMessage = 'Missing order information.';
  }

  return (
    <main className="min-h-screen bg-[#F2F2F4]">
      <nav className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
          <Link href={webRoutes.landing}>
            <Image src="/ophinia-logo.png" alt="Ophinia" width={120} height={32} className="h-8 w-auto" />
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        {fulfilled ? (
          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#EFF6EC]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#2B6A1C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-black">Order Confirmed</h1>
            <p className="mt-4 text-base leading-7 text-gray-600">
              Your official 8×10 print is on its way. You'll receive a shipping confirmation from our print partner once your order ships.
            </p>
            <Link
              href={`/profile/${id}`}
              className="mt-8 inline-block rounded-lg bg-[#001B5C] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#00144A]"
            >
              Back to Profile
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-black">Something went wrong</h1>
            <p className="mt-4 text-base leading-7 text-gray-600">
              {errorMessage ?? 'We could not confirm your order.'} If your payment was charged, please contact support.
            </p>
            <Link
              href={`/profile/${id}`}
              className="mt-8 inline-block rounded-lg border border-gray-300 px-8 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-black hover:text-black"
            >
              Back to Profile
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

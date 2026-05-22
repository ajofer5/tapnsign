import Link from 'next/link';
import Image from 'next/image';
import { ReactNode } from 'react';
import { requireWebSessionUser } from '../../lib/web-auth';
import { webRoutes } from '../../lib/routes';

export const dynamic = 'force-dynamic';

export default async function WebAppLayout({ children }: { children: ReactNode }) {
  const user = await requireWebSessionUser();

  return (
    <main className="min-h-screen bg-[#F2F2F4]">
      <nav className="border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href={webRoutes.landing}>
              <Image src="/ophinia-logo.png" alt="Ophinia" width={120} height={32} className="h-8 w-auto" />
            </Link>
            <div className="hidden items-center gap-5 text-sm font-medium text-gray-600 md:flex">
              <Link href={webRoutes.home} prefetch={false} className="hover:text-black">Home</Link>
              <Link href={webRoutes.marketplace} prefetch={false} className="hover:text-black">Marketplace</Link>
              <Link href={webRoutes.collection} prefetch={false} className="hover:text-black">Collection</Link>
              <Link href={webRoutes.activity} prefetch={false} className="hover:text-black">Activity</Link>
              <Link href={webRoutes.account} prefetch={false} className="hover:text-black">Account</Link>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-black">{user?.display_name ?? 'Web Visitor'}</div>
            <div className="mt-1 flex items-center justify-end gap-3 text-xs font-medium text-gray-500">
              <Link href={webRoutes.saved} prefetch={false} className="hover:text-black">Saved</Link>
              <Link href={webRoutes.personalizedRequests} prefetch={false} className="hover:text-black">Requests</Link>
              <Link href={webRoutes.myListings} prefetch={false} className="hover:text-black">Sell</Link>
              <form action={webRoutes.logout} method="post">
                <button
                  type="submit"
                  className="transition-colors hover:text-black"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>
      {children}
    </main>
  );
}

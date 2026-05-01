import Link from 'next/link';
import Image from 'next/image';
import { ReactNode } from 'react';
import { requireWebSessionUser } from '../../lib/web-auth';

export const dynamic = 'force-dynamic';

export default async function WebAppLayout({ children }: { children: ReactNode }) {
  const user = await requireWebSessionUser();

  return (
    <main className="min-h-screen bg-[#F2F2F4]">
      <nav className="border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/">
              <Image src="/logo.png" alt="TapnSign" width={120} height={32} className="h-8 w-auto" />
            </Link>
            <div className="hidden items-center gap-4 text-sm text-gray-600 md:flex">
              <Link href="/app" prefetch={false} className="hover:text-black">Home</Link>
              <Link href="/app/account" prefetch={false} className="hover:text-black">Account</Link>
              <Link href="/app/activity" prefetch={false} className="hover:text-black">Activity</Link>
              <Link href="/app/collection" prefetch={false} className="hover:text-black">Collection</Link>
              <Link href="/app/saved" prefetch={false} className="hover:text-black">Saved</Link>
              <Link href="/app/me/listings" prefetch={false} className="hover:text-black">My Listings</Link>
              <Link href="/app/me/offers" prefetch={false} className="hover:text-black">Offer Queue</Link>
              <Link href="/marketplace" prefetch={false} className="hover:text-black">Marketplace</Link>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.22em] text-gray-500">TapnSign Account</div>
            <div className="text-sm font-semibold text-black">{user?.display_name ?? 'Web Visitor'}</div>
            <form action="/logout" method="post">
              <button
                type="submit"
                className="text-xs font-semibold text-gray-500 transition-colors hover:text-black"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </nav>
      {children}
    </main>
  );
}

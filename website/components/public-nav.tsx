import Link from 'next/link';
import Image from 'next/image';
import { webRoutes } from '../lib/routes';

type PublicNavUser = {
  id: string;
  display_name?: string | null;
};

export function PublicNav({
  user,
  returnPath,
}: {
  user: PublicNavUser | null;
  returnPath: string;
}) {
  return (
    <nav className="border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href={webRoutes.landing}>
            <Image src="/ophinia-logo.png" alt="Ophinia" width={120} height={32} className="h-8 w-auto" />
          </Link>
          <div className="hidden items-center gap-5 text-sm font-medium text-gray-600 md:flex">
            <Link href={webRoutes.marketplace} className="hover:text-black">Marketplace</Link>
            {user ? (
              <>
                <Link href={`/profile/${user.id}`} className="hover:text-black">Profile</Link>
                <Link href={webRoutes.collection} className="hover:text-black">Collection</Link>
                <Link href={webRoutes.activity} className="hover:text-black">Activity</Link>
                <Link href={webRoutes.account} className="hover:text-black">Account</Link>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <div className="text-right">
              <div className="text-sm font-semibold text-black">{user.display_name ?? ''}</div>
              <div className="mt-1 flex items-center justify-end gap-3 text-xs font-medium text-gray-500">
                <form action={webRoutes.logout} method="post">
                  <button type="submit" className="transition-colors hover:text-black">Sign Out</button>
                </form>
              </div>
            </div>
          ) : (
            <>
              <Link
                href={`${webRoutes.login}?next=${encodeURIComponent(returnPath)}`}
                className="text-sm font-semibold text-gray-600 transition-colors hover:text-black"
              >
                Sign In
              </Link>
              <Link
                href={`${webRoutes.signup}?next=${encodeURIComponent(returnPath)}`}
                className="text-sm font-semibold text-gray-600 transition-colors hover:text-black"
              >
                Create Account
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

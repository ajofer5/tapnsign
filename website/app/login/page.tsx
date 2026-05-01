import Link from 'next/link';
import Image from 'next/image';
import { signInWithPasswordAction } from './actions';
import { getWebSessionUser } from '../../lib/web-auth';
import { GoogleSignInButton } from '../../components/google-sign-in-button';
import { AppleSignInButton } from '../../components/apple-sign-in-button';

function sanitizeNextPath(value?: string) {
  if (!value) return '/app';
  if (!value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{
    sent?: string;
    email?: string;
    error?: string;
    detail?: string;
    next?: string;
    logged_out?: string;
    created?: string;
  }>;
}) {
  const resolvedSearch = await searchParams;
  const existingUser = await getWebSessionUser();
  const next = sanitizeNextPath(resolvedSearch?.next);

  const email = resolvedSearch?.email ?? '';
  const error = resolvedSearch?.error;
  const detail = resolvedSearch?.detail;
  const loggedOut = resolvedSearch?.logged_out === '1';

  return (
    <main className="min-h-screen bg-[#F2F2F4] px-6 py-10 md:py-16">
      <div className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center">
        <Link href="/" className="mb-8">
          <Image
            src="/logo.png"
            alt="TapnSign"
            width={260}
            height={110}
            className="h-auto w-[220px] md:w-[260px]"
            priority
          />
        </Link>

        {existingUser ? (
          <div className="mb-4 w-full rounded-2xl bg-[#F6F6F7] px-5 py-4 text-sm font-medium text-gray-700">
            You&apos;re already signed in as {existingUser.display_name}.{' '}
            <Link href={next} className="font-semibold text-black underline">
              Continue to your account
            </Link>
            .
          </div>
        ) : null}

        {loggedOut ? (
          <div className="mb-4 w-full rounded-2xl bg-[#F6F6F7] px-5 py-4 text-sm font-medium text-gray-700">
            You have been signed out.
          </div>
        ) : null}
        {error ? (
          <div className="mb-4 w-full rounded-2xl bg-[#FDECEC] px-5 py-4 text-sm font-medium text-[#B3261E]">
            {error === 'missing'
              ? 'Enter your email and password to continue.'
              : error === 'account'
                ? 'We could not find a TapnSign account for that email.'
                : error === 'password'
                  ? 'That email or password was incorrect.'
                : error === 'callback'
                  ? 'That sign-in link is invalid or has expired.'
                  : error === 'google'
                    ? 'Google sign-in failed. Please try again.'
                    : error === 'apple'
                      ? 'Apple sign-in failed. Please try again.'
                      : 'Could not send a sign-in link. Please try again.'}
            {detail ? <div className="mt-2 text-xs font-normal text-[#7D2019]">{detail}</div> : null}
          </div>
        ) : null}

        <form action={signInWithPasswordAction} className="w-full space-y-3">
          <input type="hidden" name="next" value={next} />
          <input
            type="email"
            name="email"
            defaultValue={email}
            placeholder="Email"
            className="w-full rounded-xl border border-transparent bg-white px-4 py-4 text-base text-black outline-none transition-colors placeholder:text-[#999] focus:border-[#E53935]"
            autoComplete="email"
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            className="w-full rounded-xl border border-transparent bg-white px-4 py-4 text-base text-black outline-none transition-colors placeholder:text-[#999] focus:border-[#E53935]"
            autoComplete="current-password"
            required
          />

          <button
            type="submit"
            className="w-full rounded-xl bg-[#E53935] px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-[#cf302d]"
          >
            Sign In
          </button>
        </form>

        <div className="my-6 flex w-full items-center">
          <div className="flex-grow border-t border-gray-300" />
          <span className="mx-4 text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">or</span>
          <div className="flex-grow border-t border-gray-300" />
        </div>

        <div className="w-full space-y-3">
          <AppleSignInButton next={next} />
          <GoogleSignInButton next={next} />
        </div>

        <div className="mt-6 text-center text-sm text-gray-700">
          Need an account?{' '}
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="font-semibold text-black hover:text-[#E53935]"
          >
            Sign up
          </Link>
          {resolvedSearch?.created === '1' ? ' Your account was created successfully, so you can sign in now.' : ''}
        </div>

        <div className="mt-3">
          <Link
            href="/marketplace"
            className="text-sm font-semibold text-gray-600 transition-colors hover:text-black"
          >
            Browse Marketplace
          </Link>
        </div>
      </div>
    </main>
  );
}

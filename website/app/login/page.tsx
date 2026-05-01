import Link from 'next/link';
import { requestLoginLinkAction } from './actions';
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
    next?: string;
    logged_out?: string;
    created?: string;
  }>;
}) {
  const resolvedSearch = await searchParams;
  const existingUser = await getWebSessionUser();
  const next = sanitizeNextPath(resolvedSearch?.next);

  const sent = resolvedSearch?.sent === '1';
  const email = resolvedSearch?.email ?? '';
  const error = resolvedSearch?.error;
  const loggedOut = resolvedSearch?.logged_out === '1';

  return (
    <main className="min-h-screen bg-[#F2F2F4] px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-[2rem] bg-white p-8 shadow-sm md:p-10">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="text-lg font-black text-[#E53935]">
              TapnSign
            </Link>
            <Link
              href="/marketplace"
              className="text-sm font-semibold text-gray-600 transition-colors hover:text-black"
            >
              Marketplace
            </Link>
          </div>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Web Sign In
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
            Continue on TapnSign Web
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-gray-600">
            Use the same email as your TapnSign account. We&apos;ll send a secure sign-in link and bring you straight into the web app.
          </p>

          {existingUser ? (
            <div className="mt-6 rounded-2xl bg-[#F6F6F7] px-5 py-4 text-sm font-medium text-gray-700">
              You&apos;re already signed in as {existingUser.display_name}.{' '}
              <Link href={next} className="font-semibold text-black underline">
                Continue to your account
              </Link>
              .
            </div>
          ) : null}

          {sent ? (
            <div className="mt-6 rounded-2xl bg-[#EFF6EC] px-5 py-4 text-sm font-medium text-[#2B6A1C]">
              Sign-in link sent to {email || 'your email'}. Open it on this device to continue.
            </div>
          ) : null}
          {loggedOut ? (
            <div className="mt-6 rounded-2xl bg-[#F6F6F7] px-5 py-4 text-sm font-medium text-gray-700">
              You have been signed out.
            </div>
          ) : null}
          {error ? (
            <div className="mt-6 rounded-2xl bg-[#FDECEC] px-5 py-4 text-sm font-medium text-[#B3261E]">
              {error === 'missing'
                ? 'Enter your email to continue.'
                : error === 'account'
                  ? 'We could not find a TapnSign account for that email.'
                  : error === 'callback'
                    ? 'That sign-in link is invalid or has expired.'
                    : error === 'google'
                      ? 'Google sign-in failed. Please try again.'
                      : error === 'apple'
                        ? 'Apple sign-in failed. Please try again.'
                        : 'Could not send a sign-in link. Please try again.'}
            </div>
          ) : null}

          <div className="mt-8 space-y-3">
            <AppleSignInButton next={next} />
            <GoogleSignInButton next={next} />
          </div>

          <div className="relative my-6 flex items-center">
            <div className="flex-grow border-t border-gray-200" />
            <span className="mx-4 text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">or</span>
            <div className="flex-grow border-t border-gray-200" />
          </div>

          <form action={requestLoginLinkAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                Email
              </div>
              <input
                type="email"
                name="email"
                defaultValue={email}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base text-black outline-none transition-colors placeholder:text-gray-400 focus:border-black"
                autoComplete="email"
                required
              />
            </label>

            <button
              type="submit"
              className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
            >
              Email Me a Sign-In Link
            </button>
          </form>

          <div className="mt-8 border-t border-gray-200 pt-6 text-sm leading-7 text-gray-600">
            Need an account first?{' '}
            <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-black hover:text-[#E53935]">
              Create one here
            </Link>
            . Once you have a TapnSign account, this web login will bring you into your browser session without a second password flow.
            {resolvedSearch?.created === '1' ? ' Your account was created successfully, so you can sign in now.' : ''}
          </div>
        </div>
      </div>
    </main>
  );
}

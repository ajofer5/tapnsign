import Link from 'next/link';
import { createAccountAction } from './actions';
import { getWebSessionUser } from '../../lib/web-session';

function sanitizeNextPath(value?: string) {
  if (!value) return '/app';
  if (!value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    next?: string;
  }>;
}) {
  const resolvedSearch = await searchParams;
  const existingUser = await getWebSessionUser();
  const next = sanitizeNextPath(resolvedSearch?.next);

  const error = resolvedSearch?.error;

  return (
    <main className="min-h-screen bg-[#F2F2F4] px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-[2rem] bg-white p-8 shadow-sm md:p-10">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="text-lg font-black text-[#E53935]">
              TapnSign
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold text-gray-600 transition-colors hover:text-black"
            >
              Sign In
            </Link>
          </div>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Create Account
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
            Start collecting on the web
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-gray-600">
            Create your TapnSign account here, then browse listings, save autographs, make offers, and complete purchases on the web.
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

          {error ? (
            <div className="mt-6 rounded-2xl bg-[#FDECEC] px-5 py-4 text-sm font-medium text-[#B3261E]">
              {error === 'missing'
                ? 'Please fill in every field.'
                : error === 'password'
                  ? 'Password must be at least 6 characters.'
                  : error === 'exists'
                    ? 'An account with this email already exists. Try signing in instead.'
                    : error === 'email'
                      ? 'Please enter a valid email address.'
                      : 'Could not create your account. Please try again.'}
            </div>
          ) : null}

          <form action={createAccountAction} className="mt-8 space-y-4">
            <input type="hidden" name="next" value={next} />

            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                Display Name
              </div>
              <input
                type="text"
                name="display_name"
                placeholder="Your name"
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base text-black outline-none transition-colors placeholder:text-gray-400 focus:border-black"
                autoComplete="nickname"
                required
              />
            </label>

            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                Email
              </div>
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base text-black outline-none transition-colors placeholder:text-gray-400 focus:border-black"
                autoComplete="email"
                required
              />
            </label>

            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                Password
              </div>
              <input
                type="password"
                name="password"
                placeholder="At least 6 characters"
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base text-black outline-none transition-colors placeholder:text-gray-400 focus:border-black"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>

            <button
              type="submit"
              className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
            >
              Create Account
            </button>
          </form>

          <div className="mt-8 border-t border-gray-200 pt-6 text-sm leading-7 text-gray-600">
            Already have a TapnSign account?{' '}
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-black hover:text-[#E53935]">
              Sign in here
            </Link>
            .
          </div>
        </div>
      </div>
    </main>
  );
}

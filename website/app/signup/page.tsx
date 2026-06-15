import Image from 'next/image';
import Link from 'next/link';
import { createAccountAction } from './actions';
import { MAX_DISPLAY_NAME_LENGTH } from '../../../lib/display-name';
import { getWebSessionUser } from '../../lib/web-auth';
import { sanitizeNextPath, webRoutes, withNext } from '../../lib/routes';

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
  const next = sanitizeNextPath(resolvedSearch?.next, webRoutes.home);

  const error = resolvedSearch?.error;

  return (
    <main className="min-h-screen bg-[#F2F2F4] px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-[2rem] bg-white p-8 shadow-sm md:p-10">
          <div className="flex items-center justify-between gap-4">
            <Link href="/">
              <Image src="/ophinia-logo.png" alt="Ophinia" width={120} height={32} className="h-8 w-auto" />
            </Link>
            <Link
              href={webRoutes.login}
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
            Create your Ophinia account here, then browse authenticated autographs, save favorites, and order official prints where available.
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
                      : error === 'display_name'
                        ? `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`
                        : error === 'dob'
                          ? 'Please enter a valid date of birth.'
                          : error === 'age'
                            ? 'You must be at least 13 years old to create an account.'
                            : error === 'terms'
                              ? 'Please confirm that you are 13 or older and agree to the Terms of Service and Privacy Policy.'
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
                maxLength={MAX_DISPLAY_NAME_LENGTH}
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

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 mb-2">
                Date of Birth
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="dob_month"
                  placeholder="MM"
                  maxLength={2}
                  className="w-16 rounded-2xl border border-gray-200 bg-white px-3 py-4 text-base text-black outline-none transition-colors placeholder:text-gray-400 focus:border-black text-center"
                  required
                />
                <input
                  type="text"
                  name="dob_day"
                  placeholder="DD"
                  maxLength={2}
                  className="w-16 rounded-2xl border border-gray-200 bg-white px-3 py-4 text-base text-black outline-none transition-colors placeholder:text-gray-400 focus:border-black text-center"
                  required
                />
                <input
                  type="text"
                  name="dob_year"
                  placeholder="YYYY"
                  maxLength={4}
                  className="w-24 rounded-2xl border border-gray-200 bg-white px-3 py-4 text-base text-black outline-none transition-colors placeholder:text-gray-400 focus:border-black text-center"
                  required
                />
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="age_confirmed"
                value="1"
                className="mt-1 h-4 w-4 flex-shrink-0 accent-black"
                required
              />
              <span className="text-sm text-gray-600">
                I am 13 or older and agree to the{' '}
                <a href="/terms" className="font-semibold text-black underline hover:text-[#6722F7]">
                  Terms of Service
                </a>
                {' '}and{' '}
                <a href="/privacy" className="font-semibold text-black underline hover:text-[#6722F7]">
                  Privacy Policy
                </a>
              </span>
            </label>

            <button
              type="submit"
              className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
            >
              Create Account
            </button>
          </form>

          <div className="mt-8 border-t border-gray-200 pt-6 text-sm leading-7 text-gray-600">
            Already have an Ophinia account?{' '}
            <Link href={withNext(webRoutes.login, next)} className="font-semibold text-black hover:text-[#6722F7]">
              Sign in here
            </Link>
            .
          </div>
        </div>
      </div>
    </main>
  );
}

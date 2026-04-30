import Link from 'next/link';
import { requireWebSessionUser } from '../../../lib/web-auth';
import { createWebsiteAdminSupabaseClient } from '../../../lib/supabase';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; canceled?: string; error?: string }>;
}) {
  const resolvedSearch = await searchParams;
  const user = await requireWebSessionUser();
  const supabase = createWebsiteAdminSupabaseClient();

  // Check if user is already verified
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, verification_status')
    .eq('id', user.id)
    .maybeSingle();

  const alreadyVerified =
    profile?.role === 'verified' && profile?.verification_status === 'verified';

  // Check for a courtesy retry
  const { data: courtesyEvent } = await supabase
    .from('payment_events')
    .select('id')
    .eq('user_id', user.id)
    .eq('purpose', 'verification_fee')
    .not('courtesy_retry_granted_at', 'is', null)
    .is('courtesy_retry_consumed_at', null)
    .limit(1)
    .maybeSingle();

  const hasCourtesyRetry = !!courtesyEvent;
  const status = resolvedSearch?.status;
  const canceled = resolvedSearch?.canceled === '1';
  const error = resolvedSearch?.error;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-[2rem] bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
          Creator Verification
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-black">
          Get Verified
        </h1>
        <p className="mt-4 text-lg leading-8 text-gray-600">
          Verified creators get a badge on their profile and listings, building buyer trust and
          unlocking higher visibility on the marketplace.
        </p>

        <div className="mt-8 rounded-[1.75rem] bg-[#F6F6F7] p-6">
          <div className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Verification Fee
            </span>
            <span className="text-3xl font-black text-black">
              {hasCourtesyRetry ? 'Free (Courtesy Retry)' : '$4.99'}
            </span>
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-gray-600">
            <li>✓ One-time fee — pay once, verified forever</li>
            <li>✓ Government-issued ID required for identity check</li>
            <li>✓ Verification badge on your profile and all listings</li>
            <li>✓ Promo codes accepted at checkout</li>
          </ul>
        </div>

        {status === 'success' ? (
          <div className="mt-6 rounded-2xl bg-[#EFF6EC] px-5 py-4 text-sm font-medium text-[#2B6A1C]">
            Payment complete. Your identity verification has been started — check your email for
            next steps from Stripe Identity.
          </div>
        ) : null}
        {canceled ? (
          <div className="mt-6 rounded-2xl bg-[#FFF5E5] px-5 py-4 text-sm font-medium text-[#8A5A00]">
            Checkout was canceled before payment completed.
          </div>
        ) : null}
        {error === 'already_verified' || alreadyVerified ? (
          <div className="mt-6 rounded-2xl bg-[#EFF6EC] px-5 py-4 text-sm font-medium text-[#2B6A1C]">
            Your account is already verified.
          </div>
        ) : null}
        {error && error !== 'already_verified' ? (
          <div className="mt-6 rounded-2xl bg-[#FDECEC] px-5 py-4 text-sm font-medium text-[#B3261E]">
            Could not complete verification checkout. Please try again or contact support.
          </div>
        ) : null}

        {!alreadyVerified && status !== 'success' ? (
          <form action="/app/verify/start" method="post" className="mt-8">
            <button
              type="submit"
              className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D]"
            >
              {hasCourtesyRetry ? 'Start Free Courtesy Retry' : 'Continue to Secure Checkout — $4.99'}
            </button>
          </form>
        ) : null}

        <div className="mt-8">
          <Link
            href="/app/account"
            className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
          >
            Back to Account
          </Link>
        </div>
      </div>
    </div>
  );
}

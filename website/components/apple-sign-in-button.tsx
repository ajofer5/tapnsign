'use client';

import { useState } from 'react';
import { createBrowserSupabaseClient } from '../lib/supabase';

export function AppleSignInButton({ next }: { next: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/auth/google/callback?next=${encodeURIComponent(next)}`,
      },
    });
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2D] disabled:opacity-60"
    >
      <svg width="17" height="20" viewBox="0 0 17 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M13.769 10.566c-.022-2.453 2.003-3.641 2.094-3.698-1.141-1.668-2.916-1.896-3.546-1.921-1.503-.153-2.94.888-3.702.888-.762 0-1.934-.868-3.182-.845-1.635.024-3.144.952-3.982 2.412-1.703 2.951-.436 7.323 1.223 9.717.814 1.172 1.778 2.487 3.047 2.439 1.224-.049 1.685-.787 3.163-.787 1.479 0 1.893.787 3.183.761 1.314-.024 2.145-1.194 2.952-2.371.934-1.355 1.316-2.674 1.338-2.741-.029-.013-2.562-.981-2.588-3.854zM11.418 3.368C12.086 2.554 12.54 1.432 12.41.29c-.96.04-2.126.639-2.814 1.435-.617.713-1.16 1.853-1.015 2.947 1.071.083 2.169-.544 2.837-1.304z" fill="white"/>
      </svg>
      {loading ? 'Redirecting…' : 'Sign in with Apple'}
    </button>
  );
}

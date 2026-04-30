'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserSupabaseClient } from '../../../../lib/supabase';

function sanitizeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}

async function exchangeForAccessToken(code: string | null): Promise<string | null> {
  const supabase = createBrowserSupabaseClient();

  // PKCE flow: ?code= param
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session) return null;
    return data.session.access_token;
  }

  // Implicit flow: #access_token= in hash
  const hash = window.location.hash;
  if (hash) {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const { data, error } = await supabase.auth.setSession({
      access_token: params.get('access_token') ?? '',
      refresh_token: params.get('refresh_token') ?? '',
    });
    if (error || !data.session) return null;
    return data.session.access_token;
  }

  return null;
}

function GoogleCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const next = sanitizeNext(searchParams.get('next'));

    exchangeForAccessToken(code).then(async (accessToken) => {
      if (!accessToken) {
        setErrorMsg(`No token. code=${code ? 'present' : 'missing'} hash=${window.location.hash ? 'present' : 'missing'}`);
        return;
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/auth/google/complete';

      const accessTokenInput = document.createElement('input');
      accessTokenInput.type = 'hidden';
      accessTokenInput.name = 'access_token';
      accessTokenInput.value = accessToken;
      form.appendChild(accessTokenInput);

      const nextInput = document.createElement('input');
      nextInput.type = 'hidden';
      nextInput.name = 'next';
      nextInput.value = next;
      form.appendChild(nextInput);

      document.body.appendChild(form);
      form.submit();
    });
  }, [router, searchParams]);

  if (errorMsg) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F2F2F4]">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-[#B3261E]">{errorMsg}</p>
          <a href="/login" className="mt-4 block text-sm font-semibold text-black underline">Back to sign in</a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F2F2F4]">
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-gray-600">Signing you in…</p>
      </div>
    </main>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense>
      <GoogleCallbackInner />
    </Suspense>
  );
}

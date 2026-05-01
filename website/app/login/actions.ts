'use server';

import { redirect } from 'next/navigation';
import { createWebsiteMutableServerSupabaseClient, createWebsiteSupabaseClient } from '../../lib/supabase';

function sanitizeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value) return '/app';
  if (!value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}

function getWebsiteBaseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

export async function signInWithPasswordAction(formData: FormData) {
  const rawEmail = formData.get('email');
  const rawPassword = formData.get('password');
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  const next = sanitizeNextPath(formData.get('next'));

  if (!email || !password) {
    redirect(`/login?error=missing&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createWebsiteMutableServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect(`/login?error=password&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

export async function requestLoginLinkAction(formData: FormData) {
  const rawEmail = formData.get('email');
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  const next = sanitizeNextPath(formData.get('next'));

  if (!email) {
    redirect(`/login?error=missing&next=${encodeURIComponent(next)}`);
  }

  const supabase = createWebsiteSupabaseClient();
  const redirectTo = `${getWebsiteBaseUrl()}/auth/callback?next=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    const message = error.message.toLowerCase();
    const reason = message.includes('user')
      ? 'account'
      : 'send';
    redirect(
      `/login?error=${encodeURIComponent(reason)}&detail=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`
    );
  }

  redirect(`/login?sent=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
}

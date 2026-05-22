'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createWebsiteMutableServerSupabaseClient, createWebsiteSupabaseClient } from '../../lib/supabase';
import { createWebSessionToken, getWebSessionCookieConfig, getWebSessionUserForProfile } from '../../lib/web-session';
import { getWebsiteBaseUrl, sanitizeNextPath, webRoutes, withNext, withParams } from '../../lib/routes';

export async function signInWithPasswordAction(formData: FormData) {
  const rawEmail = formData.get('email');
  const rawPassword = formData.get('password');
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  const next = sanitizeNextPath(formData.get('next'), webRoutes.home);

  if (!email || !password) {
    redirect(withParams(webRoutes.login, { error: 'missing', next }));
  }

  const supabase = await createWebsiteMutableServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect(withParams(webRoutes.login, { error: 'password', next }));
  }

  const sessionUser = await getWebSessionUserForProfile(data.user.id, data.user.email ?? null);
  if (sessionUser) {
    const cookieStore = await cookies();
    cookieStore.set(getWebSessionCookieConfig(createWebSessionToken(sessionUser)));
  }

  redirect(next);
}

export async function requestLoginLinkAction(formData: FormData) {
  const rawEmail = formData.get('email');
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  const next = sanitizeNextPath(formData.get('next'), webRoutes.home);

  if (!email) {
    redirect(withParams(webRoutes.login, { error: 'missing', next }));
  }

  const supabase = createWebsiteSupabaseClient();
  const redirectTo = `${getWebsiteBaseUrl()}${withNext('/auth/callback', next)}`;

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
    redirect(withParams(webRoutes.login, { error: reason, detail: error.message, next }));
  }

  redirect(withParams(webRoutes.login, { sent: 1, email, next }));
}

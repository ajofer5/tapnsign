'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createWebsiteMutableServerSupabaseClient } from '../../lib/supabase';
import { createWebSessionToken, getWebSessionCookieConfig, getWebSessionUserForProfile } from '../../lib/web-session';
import { sanitizeNextPath, webRoutes, withParams } from '../../lib/routes';

export async function createAccountAction(formData: FormData) {
  const rawDisplayName = formData.get('display_name');
  const rawEmail = formData.get('email');
  const rawPassword = formData.get('password');
  const displayName = typeof rawDisplayName === 'string' ? rawDisplayName.trim() : '';
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  const next = sanitizeNextPath(formData.get('next'), webRoutes.home);

  if (!displayName || !email || !password) {
    redirect(withParams(webRoutes.signup, { error: 'missing', next }));
  }

  if (password.length < 6) {
    redirect(withParams(webRoutes.signup, { error: 'password', next }));
  }

  const supabase = await createWebsiteMutableServerSupabaseClient();
  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
      },
    },
  });

  if (signUpError) {
    const message = signUpError.message.toLowerCase();
    const reason = message.includes('already registered')
      ? 'exists'
      : message.includes('invalid email')
        ? 'email'
        : 'create';
    redirect(withParams(webRoutes.signup, { error: reason, next }));
  }

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.user) {
    redirect(withParams(webRoutes.login, { created: 1, email, next }));
  }

  const sessionUser = await getWebSessionUserForProfile(signInData.user.id, signInData.user.email ?? null);
  if (sessionUser) {
    const cookieStore = await cookies();
    cookieStore.set(getWebSessionCookieConfig(createWebSessionToken(sessionUser)));
  }

  redirect(next);
}

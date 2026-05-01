'use server';

import { redirect } from 'next/navigation';
import { createWebsiteMutableServerSupabaseClient } from '../../lib/supabase';

function sanitizeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value) return '/app';
  if (!value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}

export async function createAccountAction(formData: FormData) {
  const rawDisplayName = formData.get('display_name');
  const rawEmail = formData.get('email');
  const rawPassword = formData.get('password');
  const displayName = typeof rawDisplayName === 'string' ? rawDisplayName.trim() : '';
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  const next = sanitizeNextPath(formData.get('next'));

  if (!displayName || !email || !password) {
    redirect(`/signup?error=missing&next=${encodeURIComponent(next)}`);
  }

  if (password.length < 6) {
    redirect(`/signup?error=password&next=${encodeURIComponent(next)}`);
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
    redirect(`/signup?error=${encodeURIComponent(reason)}&next=${encodeURIComponent(next)}`);
  }

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.user) {
    redirect(`/login?created=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

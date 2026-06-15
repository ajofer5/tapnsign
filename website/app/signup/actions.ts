'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { MAX_DISPLAY_NAME_LENGTH, normalizeDisplayName } from '../../../lib/display-name';
import { createWebsiteMutableServerSupabaseClient } from '../../lib/supabase';
import { createWebSessionToken, getWebSessionCookieConfig, getWebSessionUserForProfile } from '../../lib/web-session';
import { sanitizeNextPath, webRoutes, withParams } from '../../lib/routes';

function getAge(year: number, month: number, day: number): number {
  const today = new Date();
  let age = today.getFullYear() - year;
  const m = today.getMonth() + 1 - month;
  if (m < 0 || (m === 0 && today.getDate() < day)) age--;
  return age;
}

export async function createAccountAction(formData: FormData) {
  const rawDisplayName = formData.get('display_name');
  const rawEmail = formData.get('email');
  const rawPassword = formData.get('password');
  const rawDobMonth = formData.get('dob_month');
  const rawDobDay = formData.get('dob_day');
  const rawDobYear = formData.get('dob_year');
  const ageConfirmed = formData.get('age_confirmed') === '1';
  const displayName = typeof rawDisplayName === 'string' ? normalizeDisplayName(rawDisplayName) : '';
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  const next = sanitizeNextPath(formData.get('next'), webRoutes.home);

  if (!displayName || !email || !password || !rawDobMonth || !rawDobDay || !rawDobYear) {
    redirect(withParams(webRoutes.signup, { error: 'missing', next }));
  }

  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    redirect(withParams(webRoutes.signup, { error: 'display_name', next }));
  }

  if (password.length < 6) {
    redirect(withParams(webRoutes.signup, { error: 'password', next }));
  }

  const monthNum = parseInt(String(rawDobMonth), 10);
  const dayNum = parseInt(String(rawDobDay), 10);
  const yearNum = parseInt(String(rawDobYear), 10);
  const currentYear = new Date().getFullYear();
  if (
    isNaN(monthNum) || isNaN(dayNum) || isNaN(yearNum) ||
    monthNum < 1 || monthNum > 12 ||
    dayNum < 1 || dayNum > 31 ||
    yearNum < 1900 || yearNum > currentYear
  ) {
    redirect(withParams(webRoutes.signup, { error: 'dob', next }));
  }

  if (getAge(yearNum, monthNum, dayNum) < 13) {
    redirect(withParams(webRoutes.signup, { error: 'age', next }));
  }

  if (!ageConfirmed) {
    redirect(withParams(webRoutes.signup, { error: 'terms', next }));
  }

  const supabase = await createWebsiteMutableServerSupabaseClient();
  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        birthday_year: yearNum,
        birthday_month: monthNum,
        birthday_day: dayNum,
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

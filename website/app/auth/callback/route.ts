import { NextRequest, NextResponse } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { createWebsiteSupabaseClient } from '../../../lib/supabase';
import {
  createWebSessionToken,
  getWebSessionCookieConfig,
  getWebSessionUserForProfile,
} from '../../../lib/web-session';

function sanitizeNextPath(value: string | null) {
  if (!value) return '/app';
  if (!value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;
  const next = sanitizeNextPath(request.nextUrl.searchParams.get('next'));

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL(`/login?error=callback&next=${encodeURIComponent(next)}`, request.url));
  }

  const supabase = createWebsiteSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error || !data.user) {
    return NextResponse.redirect(new URL(`/login?error=callback&next=${encodeURIComponent(next)}`, request.url));
  }

  const sessionUser = await getWebSessionUserForProfile(data.user.id, data.user.email ?? null);
  if (!sessionUser) {
    return NextResponse.redirect(new URL(`/login?error=account&next=${encodeURIComponent(next)}`, request.url));
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(getWebSessionCookieConfig(createWebSessionToken(sessionUser)));
  return response;
}

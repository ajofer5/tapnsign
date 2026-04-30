import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteAdminSupabaseClient } from '../../../../lib/supabase';
import {
  createWebSessionToken,
  getWebSessionCookieConfig,
  getWebSessionUserForProfile,
} from '../../../../lib/web-session';

function sanitizeNextPath(value: string | null) {
  if (!value) return '/app';
  if (!value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const accessToken = typeof formData?.get('access_token') === 'string'
    ? (formData?.get('access_token') as string)
    : null;
  const next = sanitizeNextPath(
    typeof formData?.get('next') === 'string' ? (formData?.get('next') as string) : null
  );

  if (!accessToken) {
    return NextResponse.redirect(
      new URL(`/login?error=google&next=${encodeURIComponent(next)}`, request.url)
    );
  }

  const supabase = createWebsiteAdminSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return NextResponse.redirect(
      new URL(`/login?error=google&next=${encodeURIComponent(next)}`, request.url)
    );
  }

  const sessionUser = await getWebSessionUserForProfile(user.id, user.email ?? null);
  if (!sessionUser) {
    return NextResponse.redirect(
      new URL(`/login?error=account&next=${encodeURIComponent(next)}`, request.url)
    );
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(getWebSessionCookieConfig(createWebSessionToken(sessionUser)));
  return response;
}

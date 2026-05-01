import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteServerSupabaseClient } from '../../../../lib/supabase';
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

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = sanitizeNextPath(request.nextUrl.searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?error=google&next=${encodeURIComponent(next)}`, request.url)
    );
  }

  const supabase = await createWebsiteServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const authData = data as { user?: { id: string; email?: string | null } | null; session?: { user?: { id: string; email?: string | null } | null } | null } | null;
  const authUser = authData?.user ?? authData?.session?.user ?? null;
  if (error || !authUser) {
    const msg = error ? encodeURIComponent(error.message) : 'no_user';
    return NextResponse.redirect(
      new URL(`/login?error=google&detail=${msg}&next=${encodeURIComponent(next)}`, request.url)
    );
  }

  const sessionUser = await getWebSessionUserForProfile(
    authUser.id,
    authUser.email ?? null
  );

  if (!sessionUser) {
    return NextResponse.redirect(
      new URL(`/login?error=account&next=${encodeURIComponent(next)}`, request.url)
    );
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(
    getWebSessionCookieConfig(createWebSessionToken(sessionUser))
  );
  return response;
}

import { NextRequest, NextResponse } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { createWebsiteRouteSupabaseClient } from '../../../lib/supabase';
import { createWebSessionToken, getWebSessionCookieConfig, getWebSessionUserForProfile } from '../../../lib/web-session';
import { sanitizeNextPath, webRoutes, withParams } from '../../../lib/routes';

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;
  const next = sanitizeNextPath(request.nextUrl.searchParams.get('next'), webRoutes.home);

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL(withParams(webRoutes.login, { error: 'callback', next }), request.url));
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  const supabase = createWebsiteRouteSupabaseClient(request, response);
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error || !data.user) {
    return NextResponse.redirect(new URL(withParams(webRoutes.login, { error: 'callback', next }), request.url));
  }

  const sessionUser = await getWebSessionUserForProfile(data.user.id, data.user.email ?? null);
  if (!sessionUser) {
    return NextResponse.redirect(new URL(withParams(webRoutes.login, { error: 'account', next }), request.url));
  }

  response.cookies.set(getWebSessionCookieConfig(createWebSessionToken(sessionUser)));

  return response;
}

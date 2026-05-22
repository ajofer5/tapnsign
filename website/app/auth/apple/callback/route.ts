import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteRouteSupabaseClient } from '../../../../lib/supabase';
import { createWebSessionToken, getWebSessionCookieConfig, getWebSessionUserForProfile } from '../../../../lib/web-session';
import { sanitizeNextPath, webRoutes, withParams } from '../../../../lib/routes';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = sanitizeNextPath(request.nextUrl.searchParams.get('next'), webRoutes.home);

  if (!code) {
    return NextResponse.redirect(
      new URL(withParams(webRoutes.login, { error: 'apple', next }), request.url)
    );
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  const supabase = createWebsiteRouteSupabaseClient(request, response);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const authData = data as { user?: { id: string; email?: string | null } | null; session?: { user?: { id: string; email?: string | null } | null } | null } | null;
  const authUser = authData?.user ?? authData?.session?.user ?? null;
  if (error || !authUser) {
    return NextResponse.redirect(
      new URL(withParams(webRoutes.login, { error: 'apple', next }), request.url)
    );
  }

  const sessionUser = await getWebSessionUserForProfile(
    authUser.id,
    authUser.email ?? null
  );

  if (!sessionUser) {
    return NextResponse.redirect(
      new URL(withParams(webRoutes.login, { error: 'account', next }), request.url)
    );
  }

  response.cookies.set(getWebSessionCookieConfig(createWebSessionToken(sessionUser)));

  return response;
}

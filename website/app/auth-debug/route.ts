import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteRouteSupabaseClient } from '../../lib/supabase';
import { getLegacyWebSessionUser, WEB_SESSION_COOKIE } from '../../lib/web-session';

function mask(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createWebsiteRouteSupabaseClient(request, response);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  const legacyUser = await getLegacyWebSessionUser();

  const cookieNames = request.cookies.getAll().map((cookie) => cookie.name).sort();
  const supabaseCookieNames = cookieNames.filter((name) => name.startsWith('sb-'));

  return NextResponse.json({
    host: request.nextUrl.host,
    origin: request.nextUrl.origin,
    path: request.nextUrl.pathname,
    middleware_headers: {
      user_id: mask(request.headers.get('x-tapnsign-auth-user-id')),
      email: mask(request.headers.get('x-tapnsign-auth-user-email')),
      display_name: request.headers.get('x-tapnsign-auth-display-name'),
    },
    cookies: {
      names: cookieNames,
      supabase_names: supabaseCookieNames,
      has_legacy_cookie: Boolean(request.cookies.get(WEB_SESSION_COOKIE)?.value),
    },
    supabase_user: user
      ? {
          id: mask(user.id),
          email: mask(user.email ?? null),
        }
      : null,
    legacy_user: legacyUser
      ? {
          id: mask(legacyUser.id),
          email: mask(legacyUser.email),
        }
      : null,
    error: error?.message ?? null,
  });
}

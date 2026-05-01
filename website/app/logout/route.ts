import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteRouteSupabaseClient } from '../../lib/supabase';
import { getWebSessionCookieConfig } from '../../lib/web-session';

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login?logged_out=1', request.url));
  const supabase = createWebsiteRouteSupabaseClient(request, response);
  await supabase.auth.signOut();
  response.cookies.set({
    ...getWebSessionCookieConfig(''),
    maxAge: 0,
  });
  return response;
}

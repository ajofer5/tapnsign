import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteRouteSupabaseClient } from '../../lib/supabase';
import { getWebSessionCookieConfig } from '../../lib/web-session';

function buildLogoutResponse(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login?logged_out=1', request.url));
  return response;
}

export async function POST(request: NextRequest) {
  const response = buildLogoutResponse(request);
  const supabase = createWebsiteRouteSupabaseClient(request, response);
  await supabase.auth.signOut();
  response.cookies.set({
    ...getWebSessionCookieConfig(''),
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/app', request.url));
}

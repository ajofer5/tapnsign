import { NextRequest, NextResponse } from 'next/server';
import { getWebSessionCookieConfig } from '../../lib/web-session';

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login?logged_out=1', request.url));
  response.cookies.set({
    ...getWebSessionCookieConfig(''),
    maxAge: 0,
  });
  return response;
}

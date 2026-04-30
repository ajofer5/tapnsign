import { NextRequest, NextResponse } from 'next/server';
import { createWebSessionToken, getWebSessionCookieConfig, type WebSessionUser } from '../../lib/web-session';

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required.');
  return value.replace(/\/+$/, '');
}

function getSupabaseAnonKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required.');
  return value;
}

function sanitizeNextPath(value: string | null) {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

type RedeemResponse = {
  next_path: string;
  user: WebSessionUser;
};

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const requestedNextPath = sanitizeNextPath(request.nextUrl.searchParams.get('next'));

  if (!token) {
    return NextResponse.redirect(new URL('/?handoff=missing', request.url));
  }

  let redeemData: RedeemResponse;
  try {
    const response = await fetch(`${getSupabaseUrl()}/functions/v1/redeem-web-handoff-session`, {
      method: 'POST',
      headers: {
        apikey: getSupabaseAnonKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        next_path: requestedNextPath,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.redirect(new URL('/?handoff=failed', request.url));
    }

    redeemData = await response.json() as RedeemResponse;
  } catch {
    return NextResponse.redirect(new URL('/?handoff=failed', request.url));
  }

  const response = NextResponse.redirect(new URL(sanitizeNextPath(redeemData.next_path), request.url));
  response.cookies.set(getWebSessionCookieConfig(createWebSessionToken(redeemData.user)));

  return response;
}

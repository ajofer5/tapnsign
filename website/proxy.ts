import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required.');
  return value;
}

function getSupabaseAnonKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required.');
  return value;
}

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    requestHeaders.set('x-tapnsign-auth-user-id', user.id);
    requestHeaders.set('x-tapnsign-auth-user-email', user.email ?? '');
    const rawDisplayName =
      typeof user.user_metadata?.display_name === 'string'
        ? user.user_metadata.display_name.trim()
        : '';
    requestHeaders.set('x-tapnsign-auth-display-name', rawDisplayName);
  } else {
    requestHeaders.delete('x-tapnsign-auth-user-id');
    requestHeaders.delete('x-tapnsign-auth-user-email');
    requestHeaders.delete('x-tapnsign-auth-display-name');
  }

  const finalResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.cookies.getAll().forEach((cookie) => {
    finalResponse.cookies.set(cookie);
  });

  return finalResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

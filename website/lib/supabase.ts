import { createClient } from '@supabase/supabase-js';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';

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

function getServiceRoleKey() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
  return value;
}

export function createWebsiteSupabaseClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function createWebsiteServerSupabaseClient() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Middleware is responsible for keeping SSR auth cookies refreshed
            // during normal navigation. In render-only contexts, cookie writes
            // may not be permitted.
          }
        });
      },
    },
  });
}

export async function createWebsiteMutableServerSupabaseClient() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

export function createWebsiteRouteSupabaseClient(
  request: NextRequest,
  response: NextResponse
) {
  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}

export function createBrowserSupabaseClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}

export function createWebsiteAdminSupabaseClient() {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

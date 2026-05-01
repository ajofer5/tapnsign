import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createWebsiteAdminSupabaseClient, createWebsiteServerSupabaseClient } from './supabase';
import { getLegacyWebSessionUser, type WebSessionUser } from './web-session';

const getCachedWebSessionUser = cache(async (): Promise<WebSessionUser | null> => {
  const supabase = await createWebsiteServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const fallbackUser: WebSessionUser = {
      id: user.id,
      email: user.email ?? null,
      display_name:
        (typeof user.user_metadata?.display_name === 'string' && user.user_metadata.display_name.trim()) ||
        (user.email ? user.email.split('@')[0] : 'TapnSign Member'),
      role: 'member',
      verification_status: 'none',
    };

    const admin = createWebsiteAdminSupabaseClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('id, display_name, role, verification_status')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) {
      return {
        id: profile.id,
        email: user.email ?? null,
        display_name: profile.display_name,
        role: profile.role,
        verification_status: profile.verification_status,
      };
    }

    return fallbackUser;
  }

  return getLegacyWebSessionUser();
});

export async function getWebSessionUser(): Promise<WebSessionUser | null> {
  return getCachedWebSessionUser();
}

export async function requireWebSessionUser() {
  const user = await getWebSessionUser();
  if (!user) {
    const headersList = await headers();
    const path = headersList.get('x-invoke-path') ?? headersList.get('referer') ?? '/app';
    const next = path.startsWith('/') ? path : '/app';
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  return user;
}

import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createWebsiteAdminSupabaseClient } from './supabase';

export type WebSessionUser = {
  id: string;
  email: string | null;
  display_name: string;
  role: 'member' | 'verified' | 'admin';
  verification_status: 'none' | 'pending' | 'verified' | 'failed' | 'expired';
};

type WebSessionPayload = {
  user: WebSessionUser;
  iat: number;
  exp: number;
};

export const WEB_SESSION_COOKIE = 'tapnsign_web_session';

function getSecret() {
  const secret = process.env.WEB_HANDOFF_SECRET;
  if (!secret) {
    throw new Error('WEB_HANDOFF_SECRET is required.');
  }
  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function sign(value: string) {
  return createHmac('sha256', getSecret())
    .update(value)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getCookieDomain() {
  const explicit = process.env.WEB_SESSION_COOKIE_DOMAIN?.trim();
  if (explicit) return explicit.replace(/^\./, '');

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) return undefined;

  try {
    const hostname = new URL(siteUrl).hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
    ) {
      return undefined;
    }
    if (hostname === 'tapnsign.com' || hostname === 'www.tapnsign.com') {
      return 'tapnsign.com';
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function createWebSessionToken(user: WebSessionUser, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const now = Math.floor(Date.now() / 1000);
  const payload: WebSessionPayload = {
    user,
    iat: now,
    exp: now + maxAgeSeconds,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function getWebSessionCookieConfig(value: string) {
  return {
    name: WEB_SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    domain: getCookieDomain(),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function verifyWebSessionToken(token: string): WebSessionPayload | null {
  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = sign(encodedPayload);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as WebSessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function getWebSessionUser() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(WEB_SESSION_COOKIE)?.value;
  if (!raw) return null;
  return verifyWebSessionToken(raw)?.user ?? null;
}

export async function getWebSessionUserForProfile(userId: string, fallbackEmail: string | null): Promise<WebSessionUser | null> {
  const supabase = createWebsiteAdminSupabaseClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, role, verification_status')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return null;

  return {
    id: profile.id,
    email: fallbackEmail,
    display_name: profile.display_name,
    role: profile.role,
    verification_status: profile.verification_status,
  };
}

export async function refreshWebSessionCookie(userId: string, fallbackEmail: string | null) {
  const sessionUser = await getWebSessionUserForProfile(userId, fallbackEmail);
  if (!sessionUser) return null;

  const cookieStore = await cookies();
  cookieStore.set(getWebSessionCookieConfig(createWebSessionToken(sessionUser)));
  return sessionUser;
}

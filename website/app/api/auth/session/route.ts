import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteAdminSupabaseClient } from '../../../../lib/supabase';
import { createWebSessionToken, getWebSessionCookieConfig, getWebSessionUserForProfile } from '../../../../lib/web-session';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : null;

  if (!accessToken) {
    return NextResponse.json({ error: 'missing accessToken' }, { status: 400 });
  }

  const supabase = createWebsiteAdminSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }

  const sessionUser = await getWebSessionUserForProfile(user.id, user.email ?? null);
  if (!sessionUser) {
    return NextResponse.json({ error: 'no_profile' }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(getWebSessionCookieConfig(createWebSessionToken(sessionUser)));
  return response;
}

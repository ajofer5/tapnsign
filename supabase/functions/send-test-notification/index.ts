import { handleRequest, json, requireUser, supabaseAdmin } from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);

    const { data: pushRow, error } = await supabaseAdmin
      .from('push_tokens')
      .select('token, platform, updated_at, last_seen_at')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!pushRow?.token) {
      return json({
        ok: false,
        reason: 'no_token',
      }, 404);
    }

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: pushRow.token,
        title: 'TapnSign Test Notification',
        body: 'If you see this, push delivery is working for this device.',
        sound: 'default',
      }),
    });

    const expoJson = await expoResponse.json().catch(() => ({}));

    return json({
      ok: expoResponse.ok,
      token: pushRow.token,
      platform: pushRow.platform ?? null,
      updated_at: pushRow.updated_at ?? null,
      last_seen_at: pushRow.last_seen_at ?? null,
      expo: expoJson,
    });
  }, req)
);

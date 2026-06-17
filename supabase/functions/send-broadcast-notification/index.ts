import {
  handleRequest,
  HttpError,
  json,
  parseJson,
  requireInternalRequest,
  requireString,
  supabaseAdmin,
} from '../_shared/utils.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PAGE_SIZE = 1000;
const BATCH_SIZE = 100; // Expo max per request

Deno.serve((req) =>
  handleRequest(async (request) => {
    requireInternalRequest(request);

    const body = await parseJson(request);
    const title = requireString(body.title, 'title');
    const message = requireString(body.body, 'body');

    // Collect all non-revoked push tokens in pages
    const allTokens: string[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .is('revoked_at', null)
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw new HttpError(500, 'Failed to fetch push tokens.');
      if (!data || data.length === 0) break;

      for (const row of data as { token: string }[]) {
        allTokens.push(row.token);
      }
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Send in batches of 100 (Expo batch limit)
    let sent = 0;
    for (let i = 0; i < allTokens.length; i += BATCH_SIZE) {
      const batch = allTokens.slice(i, i + BATCH_SIZE);
      const messages = batch.map((token) => ({ to: token, title, body: message, sound: 'default' }));
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      }).catch((err) => console.warn('[send-broadcast-notification] batch failed:', err));
      sent += batch.length;
    }

    return json({ sent, total: allTokens.length });
  }, req)
);

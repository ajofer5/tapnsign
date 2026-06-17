import { requireActiveOwnedAutograph } from '../_shared/marketplace.ts';
import {
  assert,
  getProfile,
  handleRequest,
  json,
  parseJson,
  requireString,
  requireUser,
  supabaseAdmin,
} from '../_shared/utils.ts';

async function notifySavedCreatorFollowers(creatorId: string) {
  try {
    const [{ data: creatorProfile }, { data: savedRows }] = await Promise.all([
      supabaseAdmin.from('profiles').select('display_name').eq('id', creatorId).maybeSingle(),
      supabaseAdmin.from('saved_creators').select('user_id').eq('creator_id', creatorId),
    ]);

    if (!savedRows?.length) return;

    const creatorName = (creatorProfile as any)?.display_name ?? 'A creator you follow';
    const userIds = savedRows.map((r: { user_id: string }) => r.user_id);

    const { data: tokenRows } = await supabaseAdmin
      .from('push_tokens')
      .select('token')
      .in('user_id', userIds)
      .is('revoked_at', null);

    if (!tokenRows?.length) return;

    const tokens = (tokenRows as { token: string }[]).map((r) => r.token);
    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100);
      const messages = batch.map((token) => ({
        to: token,
        title: 'New Moment',
        body: `${creatorName} just released a new moment.`,
        sound: 'default',
      }));
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      }).catch((err: unknown) => console.warn('[set-prints-enabled] push batch failed:', err));
    }
  } catch (err: unknown) {
    console.warn('[set-prints-enabled] saved creator notify error:', (err as Error).message);
  }
}

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const body = await parseJson(request);

    const autographId = requireString(body.autograph_id, 'autograph_id');
    assert(typeof body.prints_enabled === 'boolean', 400, 'prints_enabled must be a boolean.');
    const printsEnabled: boolean = body.prints_enabled;

    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    await requireActiveOwnedAutograph(autographId, user.id);

    // Prints and visibility are coupled: enabling prints makes the autograph
    // public (required by marketplace/profile feeds); disabling makes it private.
    const update: Record<string, unknown> = {
      prints_enabled: printsEnabled,
      visibility: printsEnabled ? 'public' : 'private',
    };

    const { error } = await supabaseAdmin
      .from('autographs')
      .update(update)
      .eq('id', autographId)
      .eq('owner_id', user.id);

    assert(!error, 500, error?.message ?? 'Could not update prints_enabled.');

    // Fire-and-forget: notify followers when a moment becomes available for printing
    if (printsEnabled) {
      notifySavedCreatorFollowers(user.id);
    }

    return json({
      autograph: {
        id: autographId,
        prints_enabled: printsEnabled,
        visibility: printsEnabled ? 'public' : 'private',
      },
    });
  }, req)
);

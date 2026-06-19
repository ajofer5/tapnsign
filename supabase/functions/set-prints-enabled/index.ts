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

    if (printsEnabled) {
      assert(profile.is_creator === true, 403, 'You must be 18 or older to enable public prints.');
      const { data: payoutProfile, error: payoutError } = await supabaseAdmin
        .from('profiles')
        .select('stripe_connect_onboarding_complete, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
        .eq('id', user.id)
        .single();

      assert(!payoutError && payoutProfile, 500, payoutError?.message ?? 'Could not verify payout status.');
      assert(
        payoutProfile.stripe_connect_onboarding_complete === true &&
          payoutProfile.stripe_connect_charges_enabled === true &&
          payoutProfile.stripe_connect_payouts_enabled === true,
        403,
        'Complete payout setup before enabling public prints.'
      );
    }

    await requireActiveOwnedAutograph(autographId, user.id);

    const { data: announcementState, error: announcementStateError } = await supabaseAdmin
      .from('autographs')
      .select('public_print_announced_at')
      .eq('id', autographId)
      .single();
    assert(
      !announcementStateError && announcementState,
      500,
      announcementStateError?.message ?? 'Could not check announcement status.'
    );
    const shouldAnnounce = printsEnabled && !announcementState.public_print_announced_at;

    // Prints and visibility are coupled: enabling prints makes the autograph
    // public (required by marketplace/profile feeds); disabling makes it private.
    const update: Record<string, unknown> = {
      prints_enabled: printsEnabled,
      visibility: printsEnabled ? 'public' : 'private',
    };
    if (shouldAnnounce) {
      update.public_print_announced_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from('autographs')
      .update(update)
      .eq('id', autographId)
      .eq('owner_id', user.id);

    assert(!error, 500, error?.message ?? 'Could not update prints_enabled.');

    // Fire-and-forget: notify followers when a moment becomes available for printing
    if (shouldAnnounce) {
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

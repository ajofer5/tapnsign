import { assert, handleRequest, json, optionalString, parseJson, requireString, requireUser, getProfile, supabaseAdmin } from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const adminUser = await requireUser(request);
    const adminProfile = await getProfile(adminUser.id);
    assert(!adminProfile.suspended_at, 403, 'Account is suspended.');
    assert(adminProfile.role === 'admin', 403, 'grant-verification-courtesy-retry is admin-only.');

    const body = await parseJson(request);
    const targetUserId = requireString(body.user_id, 'user_id');
    const reason = optionalString(body.reason);

    const { data: paymentEvent, error: paymentEventError } = await supabaseAdmin
      .from('payment_events')
      .select(`
        id,
        provider_metadata,
        verification_attempt_consumed_at,
        verification_attempt_result,
        courtesy_retry_granted_at,
        courtesy_retry_consumed_at
      `)
      .eq('user_id', targetUserId)
      .eq('purpose', 'verification_fee')
      .not('verification_attempt_consumed_at', 'is', null)
      .in('verification_attempt_result', ['failed', 'expired'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    assert(!paymentEventError, 500, paymentEventError?.message ?? 'Could not load verification payment event.');
    assert(paymentEvent, 404, 'No failed or expired verification attempt found for this user.');
    assert(!paymentEvent.courtesy_retry_granted_at || !!paymentEvent.courtesy_retry_consumed_at, 409, 'A courtesy retry is already active for this user.');

    const providerMetadata = {
      ...((paymentEvent.provider_metadata as Record<string, unknown> | null) ?? {}),
      courtesy_retry: {
        granted_by: adminUser.id,
        granted_at: new Date().toISOString(),
        reason: reason ?? null,
      },
    };

    const { error: updateError } = await supabaseAdmin
      .from('payment_events')
      .update({
        courtesy_retry_granted_at: new Date().toISOString(),
        courtesy_retry_consumed_at: null,
        provider_metadata: providerMetadata,
      })
      .eq('id', paymentEvent.id);

    assert(!updateError, 500, updateError?.message ?? 'Could not grant courtesy retry.');

    return json({
      ok: true,
      payment_event_id: paymentEvent.id,
      user_id: targetUserId,
      message: 'Courtesy retry granted.',
    });
  }, req)
);

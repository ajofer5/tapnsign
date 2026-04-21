import { assert, getProfile, handleRequest, json, requireUser, supabaseAdmin } from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const adminUser = await requireUser(request);
    const adminProfile = await getProfile(adminUser.id);
    assert(!adminProfile.suspended_at, 403, 'Account is suspended.');
    assert(adminProfile.role === 'admin', 403, 'get-creator-verifications is admin-only.');

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, verification_status, verification_updated_at, role')
      .neq('verification_status', 'none')
      .order('verification_updated_at', { ascending: false });

    if (profilesError) throw new Error(profilesError.message);

    if (!profiles || profiles.length === 0) {
      return json({ creators: [] });
    }

    const userIds = profiles.map((p: any) => p.id);

    // Get latest verification event per user
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('verification_events')
      .select('user_id, event_type, provider_payload, created_at')
      .in('user_id', userIds)
      .order('created_at', { ascending: false });

    if (eventsError) throw new Error(eventsError.message);

    // Get courtesy retry status per user
    const { data: paymentEvents, error: paymentEventsError } = await supabaseAdmin
      .from('payment_events')
      .select('user_id, verification_attempt_result, courtesy_retry_granted_at, courtesy_retry_consumed_at')
      .in('user_id', userIds)
      .eq('purpose', 'verification_fee')
      .order('created_at', { ascending: false });

    if (paymentEventsError) throw new Error(paymentEventsError.message);

    // Build lookup maps
    const latestEventByUser: Record<string, any> = {};
    for (const event of (events ?? [])) {
      if (!latestEventByUser[event.user_id]) {
        latestEventByUser[event.user_id] = event;
      }
    }

    const latestPaymentByUser: Record<string, any> = {};
    for (const pe of (paymentEvents ?? [])) {
      if (!latestPaymentByUser[pe.user_id]) {
        latestPaymentByUser[pe.user_id] = pe;
      }
    }

    const creators = profiles.map((p: any) => {
      const event = latestEventByUser[p.id] ?? null;
      const payment = latestPaymentByUser[p.id] ?? null;
      const courtesyRetryActive =
        !!payment?.courtesy_retry_granted_at && !payment?.courtesy_retry_consumed_at;
      const canGrantRetry =
        (p.verification_status === 'failed' || p.verification_status === 'expired') &&
        !courtesyRetryActive;

      return {
        user_id: p.id,
        display_name: p.display_name,
        role: p.role,
        verification_status: p.verification_status,
        verification_updated_at: p.verification_updated_at,
        latest_error: event?.provider_payload?.last_error ?? null,
        courtesy_retry_active: courtesyRetryActive,
        can_grant_retry: canGrantRetry,
      };
    });

    return json({ creators });
  }, req)
);

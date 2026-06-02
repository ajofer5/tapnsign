import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'https://tapnsign.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

export type AuthUser = {
  id: string;
  email: string | null;
};

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function optionsResponse() {
  return new Response('ok', { headers: corsHeaders });
}

export async function requireUser(req: Request): Promise<AuthUser> {
  const authorization = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    throw new HttpError(401, 'Missing bearer token.');
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(401, 'Invalid or expired session.');
  }

  return { id: data.user.id, email: data.user.email ?? null };
}

export async function parseJson(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

export function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${field} is required.`);
  }
  return value.trim();
}

export function optionalString(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Expected a string.');
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function getIdempotencyKey(req: Request, body: Record<string, unknown>, fallback?: string) {
  const headerValue = req.headers.get('Idempotency-Key') ?? req.headers.get('idempotency-key');
  if (headerValue && headerValue.trim().length > 0) return headerValue.trim();

  const bodyValue = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
  if (bodyValue) return bodyValue;

  return fallback ?? null;
}

export function requirePositiveInteger(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HttpError(400, `${field} must be a positive integer.`);
  }
  return value;
}

export function parseBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

export function parseIsoDate(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${field} is required.`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${field} must be a valid ISO date string.`);
  }

  return date;
}

export function assert(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new HttpError(status, message);
}

export async function getProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(`
      id,
      role,
      verification_status,
      suspended_at,
      is_creator,
      birthday_year,
      birthday_month,
      birthday_day,
      instagram_handle,
      instagram_status,
      instagram_verified_at,
      instagram_verification_method,
      instagram_verification_code,
      instagram_verification_requested_at,
      instagram_verification_expires_at,
      instagram_verification_checked_at
    `)
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new HttpError(404, 'Profile not found.');
  }

  return data;
}

export async function usersAreBlocked(userA: string, userB: string) {
  const { data } = await supabaseAdmin
    .from('blocked_users')
    .select('blocker_id, blocked_user_id')
    .or(`and(blocker_id.eq.${userA},blocked_user_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_user_id.eq.${userA})`)
    .limit(1)
    .maybeSingle();

  return !!data;
}

export async function assertUsersNotBlocked(userA: string, userB: string, message = 'You cannot interact with this user.') {
  const blocked = await usersAreBlocked(userA, userB);
  assert(!blocked, 403, message);
}

export async function getAutographForUpdate(autographId: string) {
  const { data, error } = await supabaseAdmin
    .from('autographs')
    .select(`
      id,
      certificate_id,
      creator_id,
      owner_id,
      status,
      ownership_source,
      visibility,
      sale_state,
      listing_mode,
      is_for_sale,
      price_cents,
      open_to_trade,
      latest_transfer_id,
      auto_decline_below,
      auto_accept_above
    `)
    .eq('id', autographId)
    .single();

  if (error || !data) {
    throw new HttpError(404, 'Autograph not found.');
  }

  return data;
}

export async function createTransfer(params: {
  autographId: string;
  fromUserId: string | null;
  toUserId: string;
  transferType: 'primary_sale' | 'secondary_sale' | 'trade' | 'admin_adjustment' | 'gift';
  priceCents?: number | null;
  tradeOfferId?: string | null;
  paymentEventId?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from('transfers')
    .insert({
      autograph_id: params.autographId,
      from_user_id: params.fromUserId,
      to_user_id: params.toUserId,
      transfer_type: params.transferType,
      price_cents: params.priceCents ?? null,
      trade_offer_id: params.tradeOfferId ?? null,
      payment_event_id: params.paymentEventId ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new HttpError(500, error?.message ?? 'Could not create transfer.');
  }

  return data.id as string;
}

export async function markTradeOffersInactive(autographIds: string[]) {
  if (!autographIds.length) return;

  const { error } = await supabaseAdmin
    .from('trade_offers')
    .update({ status: 'expired', responded_at: new Date().toISOString() })
    .eq('status', 'pending')
    .or(
      autographIds
        .map((id) => `target_autograph_id.eq.${id},offered_autograph_id.eq.${id}`)
        .join(',')
    );

  if (error) {
    throw new HttpError(500, error.message);
  }
}

export async function logInterestEvent(params: {
  userId: string;
  eventType: 'offer_sent' | 'purchase_completed';
  autographId: string;
}) {
  try {
    const { data: autograph } = await supabaseAdmin
      .from('autographs')
      .select('creator_id, series_id')
      .eq('id', params.autographId)
      .maybeSingle();

    await supabaseAdmin
      .from('interest_events')
      .insert({
        user_id: params.userId,
        autograph_id: params.autographId,
        creator_id: autograph?.creator_id ?? null,
        series_id: autograph?.series_id ?? null,
        event_type: params.eventType,
      });
  } catch (error) {
    console.warn('interest event log failed:', error);
  }
}

export async function getAutographDisplayLabel(autographId: string) {
  const { data } = await supabaseAdmin
    .from('autographs')
    .select('creator_sequence_number, creator:creator_id ( display_name )')
    .eq('id', autographId)
    .maybeSingle();

  const creatorName = (data as any)?.creator?.display_name ?? 'an autograph';
  const creatorSequenceNumber = (data as any)?.creator_sequence_number;

  return creatorSequenceNumber != null
    ? `${creatorName} #${creatorSequenceNumber}`
    : creatorName;
}

export async function notifyUser(userId: string, title: string, body: string) {
  try {
    const { data } = await supabaseAdmin
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .maybeSingle();

    const token = data?.token;
    if (!token) return;

    await sendExpoPush(token, title, body);
  } catch (error) {
    console.warn('push notify failed:', error);
  }
}

export async function createBuyerCommitment(params: {
  buyerId: string;
  subjectType: 'autograph_offer' | 'personalized_request';
  subjectId: string;
  amountCents: number;
  expiresAt: string;
  provider?: string | null;
  providerReference?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabaseAdmin
    .from('buyer_commitments')
    .insert({
      buyer_id: params.buyerId,
      subject_type: params.subjectType,
      subject_id: params.subjectId,
      amount_cents: params.amountCents,
      status: 'committed',
      provider: params.provider ?? null,
      provider_reference: params.providerReference ?? null,
      expires_at: params.expiresAt,
      metadata: params.metadata ?? {},
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new HttpError(500, error?.message ?? 'Could not create buyer commitment.');
  }

  return data.id as string;
}

export async function updateBuyerCommitmentStatus(
  commitmentId: string | null | undefined,
  status: 'committed' | 'released' | 'charged' | 'expired' | 'canceled',
  extra: Record<string, unknown> = {},
) {
  if (!commitmentId) return;

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    status,
    ...extra,
  };

  if (status === 'released') payload.released_at = now;
  if (status === 'charged') payload.charged_at = now;
  if (status === 'canceled') payload.canceled_at = now;

  const { error } = await supabaseAdmin
    .from('buyer_commitments')
    .update(payload)
    .eq('id', commitmentId);

  if (error) {
    throw new HttpError(500, error.message);
  }
}

export async function getAuthorizedPaymentEvent(params: {
  paymentEventId: string;
  userId: string;
  purpose: string;
  amountCents: number;
  autographId?: string | null;
  metadata?: Record<string, string>;
}) {
  const { data: paymentEvent, error } = await supabaseAdmin
    .from('payment_events')
    .select('id, user_id, autograph_id, purpose, status, amount_cents, stripe_payment_intent_id, provider_metadata')
    .eq('id', params.paymentEventId)
    .single();

  if (error || !paymentEvent) {
    throw new HttpError(404, error?.message ?? 'Payment event not found.');
  }

  assert(paymentEvent.user_id === params.userId, 403, 'Payment event does not belong to this user.');
  assert(paymentEvent.purpose === params.purpose, 409, 'Payment event purpose mismatch.');
  assert(paymentEvent.amount_cents === params.amountCents, 409, 'Payment amount mismatch.');
  if (params.autographId) {
    assert(paymentEvent.autograph_id === params.autographId, 409, 'Payment event autograph mismatch.');
  }

  for (const [key, value] of Object.entries(params.metadata ?? {})) {
    assert(paymentEvent.provider_metadata?.[key] === value, 409, `Payment event ${key} mismatch.`);
  }

  assert(typeof paymentEvent.stripe_payment_intent_id === 'string', 409, 'Payment intent reference missing.');
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentEvent.stripe_payment_intent_id);
  assert(
    paymentIntent.status === 'requires_capture' || paymentIntent.status === 'processing' || paymentIntent.status === 'succeeded',
    409,
    'Payment authorization is no longer active.'
  );

  if (paymentEvent.status !== 'authorized' && paymentIntent.status === 'requires_capture') {
    await supabaseAdmin
      .from('payment_events')
      .update({
        status: 'authorized',
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentEvent.id);
  }

  return { paymentEvent, paymentIntent };
}

// Maximum allowed amount for a single payment intent (~$50,000).
// Blocks obviously bogus amounts while leaving room for high-value autographs.
export const MAX_PAYMENT_INTENT_CENTS = 5_000_000;

// Per-user limit: no more than 20 new payment intents created in any rolling 1-hour window.
// Idempotent retries reuse existing rows and don't count against this limit.
const PAYMENT_INTENT_RATE_LIMIT = 20;
const PAYMENT_INTENT_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function assertPaymentIntentRateLimit(userId: string) {
  const windowStart = new Date(Date.now() - PAYMENT_INTENT_RATE_WINDOW_MS).toISOString();
  const { count, error } = await supabaseAdmin
    .from('payment_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart);

  if (error) {
    // If the count query fails, log and allow — don't block legitimate users on a DB glitch.
    console.warn('Rate limit check failed:', error.message);
    return;
  }

  if ((count ?? 0) >= PAYMENT_INTENT_RATE_LIMIT) {
    throw new HttpError(429, 'Too many payment requests. Please wait before trying again.');
  }
}

export async function cancelAuthorizedPaymentEvent(paymentEventId: string | null | undefined) {
  if (!paymentEventId) return;

  const { data: paymentEvent } = await supabaseAdmin
    .from('payment_events')
    .select('id, status, stripe_payment_intent_id')
    .eq('id', paymentEventId)
    .maybeSingle();

  if (!paymentEvent) return;
  // Already in a terminal or in-progress cancel state — nothing to do.
  if (paymentEvent.status === 'canceled' || paymentEvent.status === 'cancel_failed') return;

  let stripeCanceled = true;

  if (paymentEvent.stripe_payment_intent_id) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentEvent.stripe_payment_intent_id);
      if (
        paymentIntent.status === 'requires_capture' ||
        paymentIntent.status === 'requires_payment_method' ||
        paymentIntent.status === 'requires_confirmation' ||
        paymentIntent.status === 'requires_action' ||
        paymentIntent.status === 'processing'
      ) {
        await stripe.paymentIntents.cancel(paymentEvent.stripe_payment_intent_id);
      }
      // If Stripe status is already canceled/succeeded, treat as done.
    } catch (error) {
      stripeCanceled = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('cancel payment authorization failed, queuing for retry:', errorMessage);

      // Mark as cancel_pending so the reconciliation job can retry.
      await supabaseAdmin
        .from('payment_events')
        .update({
          status: 'cancel_pending',
          cancel_last_error: errorMessage,
          cancel_last_tried_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentEventId);
      return;
    }
  }

  if (stripeCanceled) {
    await supabaseAdmin
      .from('payment_events')
      .update({
        status: 'canceled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentEventId);
  }
}

export async function captureAuthorizedPaymentEvent(paymentEventId: string | null | undefined) {
  if (!paymentEventId) {
    throw new HttpError(409, 'Payment authorization missing.');
  }

  const { data: paymentEvent, error } = await supabaseAdmin
    .from('payment_events')
    .select('id, status, stripe_payment_intent_id')
    .eq('id', paymentEventId)
    .single();

  if (error || !paymentEvent || !paymentEvent.stripe_payment_intent_id) {
    throw new HttpError(404, error?.message ?? 'Payment authorization not found.');
  }

  const paymentIntent = await stripe.paymentIntents.capture(paymentEvent.stripe_payment_intent_id);
  assert(
    paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing',
    409,
    'Could not capture the payment authorization.'
  );

  await supabaseAdmin
    .from('payment_events')
    .update({
      status: 'captured',
      captured_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentEventId);

  return paymentIntent;
}

export async function autoDeclinePendingOffers() {
  try {
    const { data: declineCandidates } = await supabaseAdmin
      .from('autograph_offers')
      .select('id, autograph_id, buyer_id, buyer_commitment_id')
      .eq('status', 'pending')
      .not('decline_after', 'is', null)
      .lt('decline_after', new Date().toISOString());

    await supabaseAdmin.rpc('auto_decline_pending_offers');

    for (const offer of declineCandidates ?? []) {
      await updateBuyerCommitmentStatus(offer.buyer_commitment_id, 'released');
      const label = await getAutographDisplayLabel(offer.autograph_id);
      await notifyUser(
        offer.buyer_id,
        'Offer Not Accepted',
        `The seller is not currently accepting offers below their estimated value for ${label}. Feel free to adjust your offer and resubmit if you're still interested.`
      );
    }
  } catch (error) {
    console.warn('auto decline offers failed:', error);
  }
}

export async function expireOffersAndNotify() {
  await autoDeclinePendingOffers();
  const nowIso = new Date().toISOString();

  const { data: reopenCandidates } = await supabaseAdmin
    .from('autograph_offers')
    .select('id, autograph_id, buyer_id, owner_id, buyer_commitment_id')
    .eq('status', 'accepted')
    .is('accepted_transfer_id', null)
    .lt('payment_due_at', nowIso);

  const { data: expiredPendingCandidates } = await supabaseAdmin
    .from('autograph_offers')
    .select('id, buyer_commitment_id')
    .eq('status', 'pending')
    .lt('expires_at', nowIso);

  const autographIds = [...new Set((reopenCandidates ?? []).map((offer) => offer.autograph_id))];
  const { data: heldCandidates } = autographIds.length > 0
    ? await supabaseAdmin
        .from('autograph_offers')
        .select('id, autograph_id, buyer_id')
        .in('autograph_id', autographIds)
        .eq('status', 'on_hold')
    : { data: [] };

  await supabaseAdmin.rpc('expire_autograph_offers');

  for (const offer of expiredPendingCandidates ?? []) {
    await updateBuyerCommitmentStatus(offer.buyer_commitment_id, 'expired');
  }

  for (const offer of reopenCandidates ?? []) {
    await updateBuyerCommitmentStatus(offer.buyer_commitment_id, 'expired');
    const label = await getAutographDisplayLabel(offer.autograph_id);
    await notifyUser(
      offer.buyer_id,
      'Offer Reopened',
      `Your accepted offer on ${label} reopened after the payment window expired.`
    );
    await notifyUser(
      offer.owner_id,
      'Offer Reopened',
      `${label} is available again after the buyer missed the payment window.`
    );
  }

  for (const offer of heldCandidates ?? []) {
    const label = await getAutographDisplayLabel(offer.autograph_id);
    await notifyUser(
      offer.buyer_id,
      'Offer Active Again',
      `Your offer on ${label} is active again after a higher offer was not completed.`
    );
  }
}

export function getRequestId() {
  return crypto.randomUUID();
}

/**
 * Fetches the platform processing fee config and computes the fee for a given
 * sale amount. Formula: ceil(amount * rate + flat_cents).
 * Returns { feeCents, proceedsCents } — both derived from the DB singleton config.
 */
export async function getPlatformFee(amountCents: number): Promise<{ feeCents: number; proceedsCents: number }> {
  const { data, error } = await supabaseAdmin
    .from('platform_fee_config')
    .select('processing_fee_rate, processing_fee_cents')
    .eq('id', 1)
    .single();

  if (error || !data) {
    // Fallback to hardcoded defaults if config row is missing — prevents blocking a sale
    console.warn('platform_fee_config fetch failed, using defaults:', error?.message);
    const feeCents = Math.ceil(amountCents * 0.065 + 50);
    return { feeCents, proceedsCents: Math.max(0, amountCents - feeCents) };
  }

  const feeCents = Math.ceil(amountCents * Number(data.processing_fee_rate) + data.processing_fee_cents);
  return { feeCents, proceedsCents: Math.max(0, amountCents - feeCents) };
}

export function requireInternalRequest(req: Request) {
  const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const headerSecret = req.headers.get('x-internal-secret');
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const allowed =
    (internalSecret && headerSecret === internalSecret) ||
    (internalSecret && bearer === internalSecret);

  if (!allowed) {
    throw new HttpError(403, 'Internal invocation required.');
  }
}

export async function sendExpoPush(token: string, title: string, body: string) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  }).catch(() => {});
}

export async function handleRequest(handler: (req: Request) => Promise<Response>, req: Request) {
  if (req.method === 'OPTIONS') return optionsResponse();

  try {
    return await handler(req);
  } catch (error: any) {
    if (error instanceof HttpError) {
      return json({ error: error.message }, error.status);
    }

    console.error('edge function error:', error?.message ?? error);
    return json({ error: error?.message ?? 'Unexpected error.' }, 500);
  }
}

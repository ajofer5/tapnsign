import {
  assert,
  expireOffersAndNotify,
  getAutographForUpdate,
  getAutographDisplayLabel,
  getProfile,
  handleRequest,
  json,
  logInterestEvent,
  notifyUser,
  parseJson,
  requirePositiveInteger,
  requireString,
  requireUser,
  supabaseAdmin,
} from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    await expireOffersAndNotify();

    const body = await parseJson(request);
    const autographId = requireString(body.autograph_id, 'autograph_id');
    const amountCents = requirePositiveInteger(body.amount_cents, 'amount_cents');

    const autograph = await getAutographForUpdate(autographId);

    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.owner_id !== user.id, 409, 'You already own this autograph.');
    assert(autograph.visibility === 'public', 409, 'Autograph is not public.');
    assert(
      autograph.sale_state === 'not_for_sale' || autograph.sale_state === 'fixed',
      409,
      'Autograph is not accepting offers.'
    );

    const { data: acceptedOfferLock } = await supabaseAdmin
      .from('autograph_offers')
      .select('id')
      .eq('autograph_id', autographId)
      .eq('status', 'accepted')
      .is('accepted_transfer_id', null)
      .gt('payment_due_at', new Date().toISOString())
      .maybeSingle();

    assert(!acceptedOfferLock, 409, 'Autograph is currently locked for an accepted offer.');

    const { data: existingPending } = await supabaseAdmin
      .from('autograph_offers')
      .select('id')
      .eq('autograph_id', autographId)
      .eq('buyer_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();

    assert(!existingPending, 409, 'You already have a pending offer on this autograph.');

    const label = await getAutographDisplayLabel(autographId);

    // ── Auto-accept: offer is at or above estimated value and seller opted in ──
    const shouldAutoAccept =
      autograph.sale_state === 'fixed' &&
      autograph.auto_accept_above === true &&
      autograph.price_cents != null &&
      amountCents >= autograph.price_cents;

    if (shouldAutoAccept) {
      const now = new Date().toISOString();
      const paymentDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data: offer, error } = await supabaseAdmin
        .from('autograph_offers')
        .insert({
          autograph_id: autographId,
          buyer_id: user.id,
          owner_id: autograph.owner_id,
          amount_cents: amountCents,
          status: 'accepted',
          expires_at: paymentDueAt,
          responded_at: now,
          accepted_at: now,
          payment_due_at: paymentDueAt,
        })
        .select('id, created_at, expires_at, status, payment_due_at')
        .single();

      if (error || !offer) {
        throw new Error(error?.message ?? 'Could not create offer.');
      }

      // Decline any other pending offers on this autograph
      await supabaseAdmin
        .from('autograph_offers')
        .update({ status: 'declined', responded_at: now })
        .eq('autograph_id', autographId)
        .eq('status', 'pending')
        .neq('id', offer.id);

      await logInterestEvent({ userId: user.id, eventType: 'offer_sent', autographId });

      await notifyUser(
        user.id,
        'Offer Accepted',
        `Your offer on ${label} was automatically accepted. Complete purchase within 24 hours.`
      );

      return json({ offer, auto_accepted: true });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // ── Auto-decline: offer is below estimated value and seller opted in ──
    const shouldAutoDecline =
      autograph.sale_state === 'fixed' &&
      autograph.auto_decline_below === true &&
      autograph.price_cents != null &&
      amountCents < autograph.price_cents;

    const declineAfter = shouldAutoDecline
      ? new Date(Date.now() + 60 * 1000).toISOString() // 1 minute
      : null;

    const { data: offer, error } = await supabaseAdmin
      .from('autograph_offers')
      .insert({
        autograph_id: autographId,
        buyer_id: user.id,
        owner_id: autograph.owner_id,
        amount_cents: amountCents,
        status: 'pending',
        expires_at: expiresAt,
        decline_after: declineAfter,
      })
      .select('id, created_at, expires_at, status')
      .single();

    if (error || !offer) {
      throw new Error(error?.message ?? 'Could not create offer.');
    }

    await logInterestEvent({ userId: user.id, eventType: 'offer_sent', autographId });

    // Only notify the owner if the offer won't be auto-declined
    if (!shouldAutoDecline) {
      await notifyUser(
        autograph.owner_id,
        'Offer Received',
        `You received a new offer on ${label}.`
      );
    }

    return json({ offer, auto_decline_scheduled: shouldAutoDecline });
  }, req)
);

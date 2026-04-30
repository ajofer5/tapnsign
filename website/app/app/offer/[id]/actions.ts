'use server';

import { redirect } from 'next/navigation';
import { usersAreBlocked } from '../../../../lib/blocks';
import { createWebsiteAdminSupabaseClient } from '../../../../lib/supabase';
import { requireWebSessionUser } from '../../../../lib/web-auth';

export type OfferFormState = {
  error?: string;
  success?: string;
};

function parseOfferCents(raw: FormDataEntryValue | null) {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().replace(/[$,\s]/g, '');
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export async function submitOfferAction(
  autographId: string,
  _prevState: OfferFormState,
  formData: FormData
): Promise<OfferFormState> {
  const user = await requireWebSessionUser();
  const supabase = createWebsiteAdminSupabaseClient();
  const amountCents = parseOfferCents(formData.get('amount'));

  if (!amountCents) {
    return { error: 'Enter a valid offer amount greater than $0.' };
  }

  const nowIso = new Date().toISOString();

  const { data: autograph } = await supabase
    .from('autographs')
    .select(`
      id,
      status,
      owner_id,
      visibility,
      sale_state,
      listing_mode,
      price_cents,
      auto_accept_above,
      auto_decline_below
    `)
    .eq('id', autographId)
    .maybeSingle();

  if (!autograph) return { error: 'Listing not found.' };
  if (autograph.status !== 'active') return { error: 'Autograph is not active.' };
  if (autograph.owner_id === user.id) return { error: 'You already own this autograph.' };
  if (await usersAreBlocked(user.id, autograph.owner_id)) {
    return { error: 'You cannot interact with this user.' };
  }
  if (autograph.visibility !== 'public') return { error: 'Autograph is not public.' };
  if (!(autograph.sale_state === 'fixed' && autograph.listing_mode === 'make_offer')) {
    return { error: 'Autograph is not accepting offers.' };
  }

  const { data: acceptedLock } = await supabase
    .from('autograph_offers')
    .select('id')
    .eq('autograph_id', autographId)
    .eq('status', 'accepted')
    .is('accepted_transfer_id', null)
    .gt('payment_due_at', nowIso)
    .maybeSingle();

  if (acceptedLock) {
    return { error: 'Autograph is currently locked for an accepted offer.' };
  }

  const { data: existingActiveOffer } = await supabase
    .from('autograph_offers')
    .select('id')
    .eq('autograph_id', autographId)
    .eq('buyer_id', user.id)
    .in('status', ['pending', 'on_hold'])
    .maybeSingle();

  if (existingActiveOffer) {
    return { error: 'You already have an active offer on this autograph.' };
  }

  const shouldAutoAccept =
    autograph.auto_accept_above === true &&
    typeof autograph.price_cents === 'number' &&
    amountCents >= autograph.price_cents;

  if (shouldAutoAccept) {
    const respondedAt = new Date().toISOString();
    const paymentDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: createdOffer, error } = await supabase
      .from('autograph_offers')
      .insert({
        autograph_id: autographId,
        buyer_id: user.id,
        owner_id: autograph.owner_id,
        amount_cents: amountCents,
        status: 'accepted',
        expires_at: paymentDueAt,
        responded_at: respondedAt,
        accepted_at: respondedAt,
        payment_due_at: paymentDueAt,
      })
      .select('id')
      .single();

    if (error || !createdOffer) {
      return { error: error?.message ?? 'Could not create offer.' };
    }

    await supabase
      .from('autograph_offers')
      .update({
        status: 'on_hold',
        decline_after: null,
        updated_at: new Date().toISOString(),
      })
      .eq('autograph_id', autographId)
      .eq('status', 'pending')
      .neq('id', createdOffer.id);

    redirect(`/app/offer/${autographId}?status=accepted`);
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const shouldAutoDecline =
    autograph.auto_decline_below === true &&
    typeof autograph.price_cents === 'number' &&
    amountCents < autograph.price_cents;

  const declineAfter = shouldAutoDecline
    ? new Date(Date.now() + 60 * 1000).toISOString()
    : null;

  const { error } = await supabase
    .from('autograph_offers')
    .insert({
      autograph_id: autographId,
      buyer_id: user.id,
      owner_id: autograph.owner_id,
      amount_cents: amountCents,
      status: 'pending',
      expires_at: expiresAt,
      decline_after: declineAfter,
    });

  if (error) {
    return { error: error.message };
  }

  redirect(`/app/offer/${autographId}?status=${shouldAutoDecline ? 'auto-decline' : 'sent'}`);
}

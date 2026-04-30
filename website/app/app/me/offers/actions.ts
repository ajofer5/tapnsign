'use server';

import { revalidatePath } from 'next/cache';
import { requireWebSessionUser } from '../../../../lib/web-auth';
import { createWebsiteAdminSupabaseClient } from '../../../../lib/supabase';

export async function respondOfferAction(offerId: string, action: 'accept' | 'decline') {
  const user = await requireWebSessionUser();
  const supabase = createWebsiteAdminSupabaseClient();

  const { data: offer } = await supabase
    .from('autograph_offers')
    .select('id, autograph_id, owner_id, buyer_id, status, expires_at')
    .eq('id', offerId)
    .maybeSingle();

  if (!offer || offer.owner_id !== user.id || offer.status !== 'pending') {
    return;
  }

  if (offer.expires_at && new Date(offer.expires_at).getTime() <= Date.now()) {
    return;
  }

  const respondedAt = new Date().toISOString();
  const paymentDueAt = action === 'accept'
    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    : null;

  await supabase
    .from('autograph_offers')
    .update({
      status: action === 'accept' ? 'accepted' : 'declined',
      responded_at: respondedAt,
      accepted_at: action === 'accept' ? respondedAt : null,
      payment_due_at: paymentDueAt,
    })
    .eq('id', offerId)
    .eq('status', 'pending');

  if (action === 'accept') {
    await supabase
      .from('autograph_offers')
      .update({
        status: 'on_hold',
        decline_after: null,
        updated_at: new Date().toISOString(),
      })
      .eq('autograph_id', offer.autograph_id)
      .eq('status', 'pending')
      .neq('id', offerId);
  }

  revalidatePath('/app/me/offers');
  revalidatePath('/app/me/listings');
  revalidatePath(`/app/listings/${offer.autograph_id}`);
}

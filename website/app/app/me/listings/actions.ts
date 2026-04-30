'use server';

import { revalidatePath } from 'next/cache';
import { requireWebSessionUser } from '../../../../lib/web-auth';
import { createWebsiteAdminSupabaseClient } from '../../../../lib/supabase';

export type ListingActionState = {
  error?: string;
  success?: string;
};

const MIN_PRICE_CENTS = 500;

function parseMoneyToCents(raw: FormDataEntryValue | null) {
  if (typeof raw !== 'string') return null;
  const amount = Number.parseFloat(raw.trim().replace(/[$,\s]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export async function saveListingAction(
  autographId: string,
  formData: FormData
): Promise<void> {
  const user = await requireWebSessionUser();
  const supabase = createWebsiteAdminSupabaseClient();
  const listingMode = formData.get('listing_mode') === 'buy_now' ? 'buy_now' : 'make_offer';
  const priceCents = parseMoneyToCents(formData.get('price'));
  const autoDeclineBelow = formData.get('auto_decline_below') === 'on';
  const autoAcceptAbove = formData.get('auto_accept_above') === 'on';

  if (!priceCents || priceCents < MIN_PRICE_CENTS) {
    throw new Error(`Price must be at least $${(MIN_PRICE_CENTS / 100).toFixed(2)}.`);
  }

  const { data: autograph } = await supabase
    .from('autographs')
    .select('id, owner_id, status')
    .eq('id', autographId)
    .maybeSingle();

  if (!autograph || autograph.owner_id !== user.id || autograph.status !== 'active') {
    throw new Error('Autograph is not available to list.');
  }

  const { error } = await supabase
    .from('autographs')
    .update({
      visibility: 'public',
      sale_state: 'fixed',
      is_for_sale: true,
      price_cents: priceCents,
      listing_mode: listingMode,
      open_to_trade: false,
      auto_decline_below: listingMode === 'make_offer' ? autoDeclineBelow : false,
      auto_accept_above: listingMode === 'make_offer' ? autoAcceptAbove : false,
    })
    .eq('id', autographId)
    .eq('owner_id', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/app/me/listings');
  revalidatePath('/marketplace');
  revalidatePath(`/profile/${user.id}`);
  revalidatePath(`/app/listings/${autographId}`);
}

export async function removeListingAction(
  autographId: string
): Promise<void> {
  const user = await requireWebSessionUser();
  const supabase = createWebsiteAdminSupabaseClient();

  await supabase
    .from('autographs')
    .update({
      sale_state: 'not_for_sale',
      is_for_sale: false,
      price_cents: null,
      open_to_trade: false,
      auto_decline_below: false,
      auto_accept_above: false,
    })
    .eq('id', autographId)
    .eq('owner_id', user.id);

  revalidatePath('/app/me/listings');
  revalidatePath('/marketplace');
  revalidatePath(`/profile/${user.id}`);
  revalidatePath(`/app/listings/${autographId}`);
}

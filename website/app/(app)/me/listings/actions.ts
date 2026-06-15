'use server';

import { revalidatePath } from 'next/cache';
import { requireWebSessionUser } from '../../../../lib/web-auth';
import { createWebsiteAdminSupabaseClient } from '../../../../lib/supabase';

export type ListingActionState = {
  error?: string;
  success?: string;
};

function parseOptionalPositiveInteger(raw: FormDataEntryValue | null) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export async function saveListingAction(
  autographId: string,
  formData: FormData
): Promise<void> {
  const user = await requireWebSessionUser();
  const supabase = createWebsiteAdminSupabaseClient();
  const printsEnabled = formData.get('prints_enabled') === 'on';
  const printLimit = parseOptionalPositiveInteger(formData.get('print_limit'));

  const { data: autograph } = await supabase
    .from('autographs')
    .select('id, owner_id, creator_id, status')
    .eq('id', autographId)
    .maybeSingle();

  if (!autograph || autograph.owner_id !== user.id || autograph.status !== 'active') {
    throw new Error('Autograph is not available to list.');
  }

  const updatePayload: Record<string, unknown> = {
    visibility: printsEnabled ? 'public' : 'private',
    sale_state: 'not_for_sale',
    is_for_sale: false,
    price_cents: null,
    listing_mode: 'make_offer',
    open_to_trade: false,
    auto_decline_below: false,
    auto_accept_above: false,
  };

  if (autograph.creator_id === user.id) {
    updatePayload.prints_enabled = printsEnabled;
    updatePayload.print_limit = printsEnabled ? printLimit : null;
  }

  const { error } = await supabase
    .from('autographs')
    .update(updatePayload)
    .eq('id', autographId)
    .eq('owner_id', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/me/listings');
  revalidatePath('/marketplace');
  revalidatePath(`/profile/${user.id}`);
  revalidatePath(`/autograph/${autographId}`);
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

  revalidatePath('/me/listings');
  revalidatePath('/marketplace');
  revalidatePath(`/profile/${user.id}`);
  revalidatePath(`/autograph/${autographId}`);
}

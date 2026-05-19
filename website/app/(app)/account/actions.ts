'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createWebsiteAdminSupabaseClient } from '../../../lib/supabase';
import { requireWebSessionUser } from '../../../lib/web-auth';

function redirectAccount(status: string) {
  redirect(`/account?status=${encodeURIComponent(status)}`);
}

export async function useVerifiedNameAction() {
  const user = await requireWebSessionUser();
  const supabase = createWebsiteAdminSupabaseClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('validated_name')
    .eq('id', user.id)
    .maybeSingle();

  const validatedName = (profile as any)?.validated_name;
  if (!validatedName) {
    redirectAccount('name_error');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: validatedName })
    .eq('id', user.id);

  if (error) {
    redirectAccount('name_error');
  }

  revalidatePath('/home');
  revalidatePath('/account');
  revalidatePath(`/profile/${user.id}`);
  redirectAccount('verified_name_saved');
}

export async function updateDisplayNameAction(formData: FormData) {
  const user = await requireWebSessionUser();
  const rawName = formData.get('display_name');
  const displayName = typeof rawName === 'string' ? rawName.trim() : '';

  if (!displayName) {
    redirectAccount('name_missing');
  }

  const supabase = createWebsiteAdminSupabaseClient();
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', user.id);

  if (error) {
    redirectAccount('name_error');
  }

  revalidatePath('/home');
  revalidatePath('/account');
  revalidatePath(`/profile/${user.id}`);
  redirectAccount('name_saved');
}

export async function updateInstagramAction(formData: FormData) {
  const user = await requireWebSessionUser();
  const rawHandle = formData.get('instagram_handle');
  const handle = typeof rawHandle === 'string' ? rawHandle.trim().replace(/^@/, '') : '';

  const supabase = createWebsiteAdminSupabaseClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      instagram_handle: handle || null,
      instagram_status: handle ? 'connected' : 'none',
      instagram_verified_at: null,
      instagram_verification_method: null,
      instagram_verification_code: null,
      instagram_verification_requested_at: null,
      instagram_verification_expires_at: null,
      instagram_verification_checked_at: null,
    })
    .eq('id', user.id);

  if (error) {
    redirectAccount('instagram_error');
  }

  revalidatePath('/account');
  revalidatePath(`/profile/${user.id}`);
  redirectAccount(handle ? 'instagram_saved' : 'instagram_removed');
}

export async function updateProfileAvatarAction(formData: FormData) {
  const user = await requireWebSessionUser();
  const rawAutographId = formData.get('autograph_id');
  const autographId = typeof rawAutographId === 'string' && rawAutographId ? rawAutographId : null;
  const supabase = createWebsiteAdminSupabaseClient();

  if (autographId) {
    const { data: autograph } = await supabase
      .from('autographs')
      .select('id')
      .eq('id', autographId)
      .eq('creator_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!autograph) {
      redirectAccount('avatar_error');
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      profile_avatar_autograph_id: autographId,
    })
    .eq('id', user.id);

  if (error) {
    redirectAccount('avatar_error');
  }

  revalidatePath('/account');
  revalidatePath(`/profile/${user.id}`);
  redirectAccount(autographId ? 'avatar_saved' : 'avatar_cleared');
}

export async function updatePersonalizedSettingsAction(formData: FormData) {
  const user = await requireWebSessionUser();
  const enabled = formData.get('personalized_requests_enabled') === 'on';
  const rawMinPrice = formData.get('personalized_min_price');
  const minPriceValue = typeof rawMinPrice === 'string' ? Number.parseFloat(rawMinPrice) : Number.NaN;

  if (enabled && (!Number.isFinite(minPriceValue) || minPriceValue <= 0)) {
    redirectAccount('personalized_error');
  }

  const supabase = createWebsiteAdminSupabaseClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'verified') {
    redirectAccount('personalized_error');
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      personalized_requests_enabled: enabled,
      personalized_min_price_cents: enabled ? Math.round(minPriceValue * 100) : null,
    })
    .eq('id', user.id);

  if (error) {
    redirectAccount('personalized_error');
  }

  revalidatePath('/account');
  revalidatePath(`/profile/${user.id}`);
  redirectAccount(enabled ? 'personalized_saved' : 'personalized_disabled');
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { MAX_DISPLAY_NAME_LENGTH, normalizeDisplayName } from '../../../lib/display-name';
import { PERSONALIZED_REQUEST_MIN_CENTS } from '../../../lib/personalized-policy';
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

export async function updateBioAction(formData: FormData) {
  const user = await requireWebSessionUser();
  const rawBio = formData.get('bio');
  const bio = typeof rawBio === 'string' ? rawBio.trim().slice(0, 100) : '';

  const supabase = createWebsiteAdminSupabaseClient();
  const { error } = await supabase
    .from('profiles')
    .update({ bio: bio || null })
    .eq('id', user.id);

  if (error) {
    redirectAccount('bio_error');
  }

  revalidatePath('/account');
  revalidatePath(`/profile/${user.id}`);
  redirectAccount('bio_saved');
}

export async function updateDisplayNameAction(formData: FormData) {
  const user = await requireWebSessionUser();
  const rawName = formData.get('display_name');
  const displayName = typeof rawName === 'string' ? normalizeDisplayName(rawName) : '';

  if (!displayName) {
    redirectAccount('name_missing');
  }

  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    redirectAccount('name_too_long');
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

  const minPriceCents = Math.round(minPriceValue * 100);
  if (enabled && (!Number.isFinite(minPriceValue) || minPriceCents < PERSONALIZED_REQUEST_MIN_CENTS)) {
    redirectAccount('personalized_error');
  }

  const supabase = createWebsiteAdminSupabaseClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, verified')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'verified' || profile?.verified !== true) {
    redirectAccount('personalized_error');
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      personalized_requests_enabled: enabled,
      personalized_min_price_cents: enabled ? minPriceCents : null,
    })
    .eq('id', user.id);

  if (error) {
    redirectAccount('personalized_error');
  }

  revalidatePath('/account');
  revalidatePath(`/profile/${user.id}`);
  redirectAccount(enabled ? 'personalized_saved' : 'personalized_disabled');
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createWebsiteAdminSupabaseClient } from '../../../lib/supabase';
import { requireWebSessionUser } from '../../../lib/web-auth';
import { refreshWebSessionCookie } from '../../../lib/web-session';

function redirectAccount(status: string) {
  redirect(`/app/account?status=${encodeURIComponent(status)}`);
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

  await refreshWebSessionCookie(user.id, user.email);
  revalidatePath('/app');
  revalidatePath('/app/account');
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

  revalidatePath('/app/account');
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

  revalidatePath('/app/account');
  revalidatePath(`/profile/${user.id}`);
  redirectAccount(autographId ? 'avatar_saved' : 'avatar_cleared');
}

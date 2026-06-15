'use server';

import { revalidatePath } from 'next/cache';
import { requireWebSessionUser } from '../../../lib/web-auth';
import { createWebsiteAdminSupabaseClient } from '../../../lib/supabase';

export async function togglePrintsAction(autographId: string, enable: boolean): Promise<void> {
  const user = await requireWebSessionUser();
  const supabase = createWebsiteAdminSupabaseClient();

  const { data: autograph } = await supabase
    .from('autographs')
    .select('id, owner_id, creator_id, status')
    .eq('id', autographId)
    .maybeSingle();

  if (
    !autograph ||
    autograph.owner_id !== user.id ||
    autograph.creator_id !== user.id ||
    autograph.status !== 'active'
  ) {
    throw new Error('Cannot toggle prints for this autograph.');
  }

  await supabase
    .from('autographs')
    .update({
      prints_enabled: enable,
      visibility: enable ? 'public' : 'private',
      print_limit: enable ? undefined : null,
    })
    .eq('id', autographId)
    .eq('owner_id', user.id);

  revalidatePath('/collection');
  revalidatePath('/me/listings');
  revalidatePath('/marketplace');
  revalidatePath(`/profile/${user.id}`);
  revalidatePath(`/autograph/${autographId}`);
}

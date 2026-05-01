'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createWebsiteAdminSupabaseClient } from '../../lib/supabase';
import { getWebSessionUser } from '../../lib/web-auth';

function sanitizeNextPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return '/marketplace';
  return value;
}

export async function toggleWatchlistAction(
  autographId: string,
  isSaved: boolean,
  nextPath: string
) {
  const user = await getWebSessionUser();
  const safeNextPath = sanitizeNextPath(nextPath);

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(safeNextPath)}`);
  }

  const supabase = createWebsiteAdminSupabaseClient();

  if (isSaved) {
    await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', user.id)
      .eq('autograph_id', autographId);
  } else {
    await supabase
      .from('watchlist')
      .insert({
        user_id: user.id,
        autograph_id: autographId,
      });
  }

  revalidatePath(safeNextPath);
  revalidatePath('/marketplace');
  revalidatePath(`/app/listings/${autographId}`);
  revalidatePath('/app');
  revalidatePath('/app/saved');
}

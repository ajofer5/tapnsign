import { createWebsiteAdminSupabaseClient } from './supabase';

export async function usersAreBlocked(userA: string, userB: string) {
  const supabase = createWebsiteAdminSupabaseClient();
  const { data } = await supabase
    .from('blocked_users')
    .select('blocker_id, blocked_user_id')
    .or(`and(blocker_id.eq.${userA},blocked_user_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_user_id.eq.${userA})`)
    .limit(1)
    .maybeSingle();

  return !!data;
}

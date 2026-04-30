import { createWebsiteAdminSupabaseClient } from './supabase';
import { mapWebsiteListingRow, type WebsiteListing } from './listings';

export type WebsiteProfile = {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  instagram_handle?: string | null;
  verified: boolean;
  verification_status?: 'none' | 'pending' | 'verified' | 'failed' | 'expired';
  member_since: string;
  creator_since?: string | null;
  stats: {
    autographs_signed: number;
    unique_series_signed: number;
    gold_signed: number;
    autographs_owned: number;
    unique_creators: number;
    unique_series_owned: number;
    public_videos_count: number;
  };
  active_listings: WebsiteListing[];
};

export async function getWebsiteProfile(id: string): Promise<WebsiteProfile | null> {
  const supabase = createWebsiteAdminSupabaseClient();
  const { data } = await supabase.rpc('get_profile_page', { p_user_id: id });
  if (!data) return null;

  const profile = data as any;
  const activeListings = ((profile.active_listings ?? profile.public_videos ?? []) as any[]).map(mapWebsiteListingRow);

  return {
    id: profile.id,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url ?? null,
    instagram_handle: profile.instagram_handle ?? null,
    verified: !!profile.verified,
    verification_status: profile.verification_status ?? 'none',
    member_since: profile.member_since,
    creator_since: profile.creator_since ?? null,
    stats: profile.stats ?? {
      autographs_signed: 0,
      unique_series_signed: 0,
      gold_signed: 0,
      autographs_owned: 0,
      unique_creators: 0,
      unique_series_owned: 0,
      public_videos_count: 0,
    },
    active_listings: activeListings,
  };
}

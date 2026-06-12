import { createWebsiteAdminSupabaseClient } from './supabase';
import { mapWebsiteListingRow, type WebsiteListing } from './listings';

export type WebsiteProfile = {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  bio?: string | null;
  instagram_handle?: string | null;
  verified: boolean;
  personalized_requests_enabled: boolean;
  personalized_min_price_cents: number | null;
  personalized_requests_at_capacity: boolean;
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
  const activeListings = ((profile.active_listings ?? profile.public_videos ?? []) as any[])
    .map(mapWebsiteListingRow)
    .filter((listing) => listing.prints_enabled);

  // Prefetch print_layout_url for any listings that don't have it cached yet.
  // Renderer caches by autograph_id so these calls are fast after mint time.
  const rendererUrl = process.env.PRINT_RENDERER_URL ?? '';
  const internalSecret = process.env.INTERNAL_FUNCTION_SECRET ?? '';
  const needsLayout = activeListings.filter((l) => !l.print_layout_url);
  if (rendererUrl && needsLayout.length > 0) {
    await Promise.allSettled(
      needsLayout.map(async (listing) => {
        try {
          const resp = await fetch(`${rendererUrl}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
            body: JSON.stringify({ autograph_id: listing.id, internal_secret: internalSecret }),
          });
          if (!resp.ok) return;
          const data = await resp.json();
          const url = typeof data?.print_layout_url === 'string' ? data.print_layout_url : null;
          if (url) {
            listing.print_layout_url = url;
            supabase.from('autographs').update({ print_layout_url: url }).eq('id', listing.id).then(() => {});
          }
        } catch { /* non-fatal */ }
      })
    );
  }
  let personalizedRequestsAtCapacity = false;
  let personalizedRequestsEnabled = !!profile.personalized_requests_enabled;

  if (personalizedRequestsEnabled) {
    const { count } = await supabase
      .from('personalized_autograph_requests')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', id)
      .in('status', ['pending', 'countered', 'accepted', 'fulfilled']);

    personalizedRequestsAtCapacity = (count ?? 0) >= 15;
    if (personalizedRequestsAtCapacity) {
      personalizedRequestsEnabled = false;
    }
  }

  return {
    id: profile.id,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url ?? null,
    bio: profile.bio ?? null,
    instagram_handle: profile.instagram_handle ?? null,
    verified: !!profile.verified,
    personalized_requests_enabled: personalizedRequestsEnabled,
    personalized_min_price_cents: profile.personalized_min_price_cents ?? null,
    personalized_requests_at_capacity: personalizedRequestsAtCapacity,
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

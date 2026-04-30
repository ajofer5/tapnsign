import { createWebsiteAdminSupabaseClient } from './supabase';
import { mapWebsiteListingRow, type WebsiteListing } from './listings';

export type WebsiteSavedListingsCursor = {
  beforeSavedAt: string;
  beforeAutographId: string;
};

export type WebsiteSavedListingsPage = {
  listings: WebsiteListing[];
  nextCursor: WebsiteSavedListingsCursor | null;
};

export async function getSavedAutographIds(userId: string, autographIds: string[]) {
  if (autographIds.length === 0) {
    return new Set<string>();
  }

  const supabase = createWebsiteAdminSupabaseClient();
  const { data: rows } = await supabase
    .from('watchlist')
    .select('autograph_id')
    .eq('user_id', userId)
    .in('autograph_id', autographIds);

  return new Set((rows ?? []).map((row) => row.autograph_id));
}

export async function getSavedListings(
  userId: string,
  limit = 24,
  cursor?: WebsiteSavedListingsCursor | null,
): Promise<WebsiteSavedListingsPage> {
  const supabase = createWebsiteAdminSupabaseClient();
  const pageLimit = Math.max(1, Math.min(limit, 100));
  const { data: rows, error } = await supabase.rpc('get_saved_listing_feed', {
    p_user_id: userId,
    p_limit: pageLimit,
    p_before_saved_at: cursor?.beforeSavedAt ?? null,
    p_before_autograph_id: cursor?.beforeAutographId ?? null,
  });

  if (error || !rows) {
    return { listings: [], nextCursor: null };
  }

  const listings = rows.map(mapWebsiteListingRow);
  const last = rows.length > 0 ? rows[rows.length - 1] : null;

  return {
    listings,
    nextCursor: rows.length < pageLimit || !last
      ? null
      : {
          beforeSavedAt: last.saved_at,
          beforeAutographId: last.id,
        },
  };
}

import { createWebsiteAdminSupabaseClient } from './supabase';
import { mapWebsiteListingRow, type WebsiteListing } from './listings';

export type MarketplaceCursor = {
  beforeCreatedAt: string;
  beforeId: string;
};

export type MarketplacePage = {
  listings: WebsiteListing[];
  nextCursor: MarketplaceCursor | null;
};

export async function getMarketplaceListings(
  viewerId?: string | null,
  limit = 48,
  cursor?: MarketplaceCursor | null,
): Promise<MarketplacePage> {
  const supabase = createWebsiteAdminSupabaseClient();
  const { data: rows, error } = await supabase.rpc('get_marketplace_feed', {
    p_limit: limit,
    p_before_created_at: cursor?.beforeCreatedAt ?? null,
    p_before_id: cursor?.beforeId ?? null,
    p_viewer_id: viewerId ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  const listings = (rows ?? []).map(mapWebsiteListingRow);
  const last = listings[listings.length - 1];

  return {
    listings,
    nextCursor: listings.length === limit && last
      ? {
          beforeCreatedAt: last.created_at,
          beforeId: last.id,
        }
      : null,
  };
}

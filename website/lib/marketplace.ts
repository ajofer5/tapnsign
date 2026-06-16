import { createWebsiteAdminSupabaseClient } from './supabase';
import { mapWebsiteListingRow, type WebsiteListing } from './listings';
import { DIGITAL_TRADING_ENABLED } from './digital-trading';

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

  const listings: WebsiteListing[] = (rows ?? [])
    .map(mapWebsiteListingRow)
    .filter((listing: WebsiteListing) => DIGITAL_TRADING_ENABLED || listing.prints_enabled);

  const rendererUrl = process.env.PRINT_RENDERER_URL ?? '';
  const internalSecret = process.env.INTERNAL_FUNCTION_SECRET ?? '';
  const needsPreview = listings.filter((listing) => listing.prints_enabled && !listing.print_preview_url);
  if (rendererUrl && needsPreview.length > 0) {
    await Promise.allSettled(
      needsPreview.map(async (listing) => {
        try {
          const response = await fetch(`${rendererUrl}/render`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': internalSecret,
            },
            body: JSON.stringify({ autograph_id: listing.id, internal_secret: internalSecret }),
          });
          if (!response.ok) return;
          const data = await response.json();
          const layoutUrl = typeof data?.print_layout_url === 'string' ? data.print_layout_url : null;
          const previewUrl = typeof data?.print_preview_url === 'string' ? data.print_preview_url : null;
          if (layoutUrl) listing.print_layout_url = layoutUrl;
          if (previewUrl) listing.print_preview_url = previewUrl;
          if (layoutUrl || previewUrl) {
            supabase
              .from('autographs')
              .update({
                ...(layoutUrl ? { print_layout_url: layoutUrl } : {}),
                ...(previewUrl ? { print_preview_url: previewUrl } : {}),
              })
              .eq('id', listing.id)
              .then(() => {});
          }
        } catch {
          // Non-fatal; the card can fall back to the existing thumbnail.
        }
      })
    );
  }

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

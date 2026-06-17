import { createWebsiteAdminSupabaseClient } from './supabase';

export type WebsiteListing = {
  id: string;
  certificate_id: string;
  created_at: string;
  creator_id: string;
  owner_id: string;
  sale_state: 'not_for_sale' | 'fixed';
  price_cents: number | null;
  video_url: string;
  thumbnail_url: string | null;
  creator_sequence_number: number | null;
  series_sequence_number: number | null;
  capture_width: number | null;
  capture_height: number | null;
  stroke_color: string | null;
  creator: {
    display_name: string;
    verified: boolean;
  } | null;
  owner: {
    display_name: string;
  } | null;
  series_name: string | null;
  series_max_size: number | null;
  print_count: number | null;
  prints_enabled: boolean;
  print_limit: number | null;
  print_layout_url: string | null;
  print_preview_url: string | null;
};

export function mapWebsiteListingRow(row: any): WebsiteListing {
  return {
    id: row.id,
    certificate_id: row.certificate_id,
    created_at: row.created_at,
    creator_id: row.creator_id,
    owner_id: row.owner_id,
    sale_state: row.sale_state === 'fixed' ? 'fixed' : 'not_for_sale',
    price_cents: row.price_cents ?? null,
    video_url: row.video_url,
    thumbnail_url: row.thumbnail_url ?? null,
    creator_sequence_number: row.creator_sequence_number ?? null,
    series_sequence_number: row.series_sequence_number ?? null,
    capture_width: row.capture_width ?? null,
    capture_height: row.capture_height ?? null,
    stroke_color: row.stroke_color ?? null,
    creator: row.creator_display_name
      ? {
          display_name: row.creator_display_name,
          verified: !!row.creator_verified,
        }
      : row.creator ?? null,
    owner: row.owner_display_name
      ? {
          display_name: row.owner_display_name,
        }
      : row.owner ?? null,
    series_name: row.series_name ?? null,
    series_max_size: row.series_max_size ?? null,
    print_count: row.print_count ?? null,
    prints_enabled: !!row.prints_enabled,
    print_limit: row.print_limit ?? null,
    print_layout_url: row.print_layout_url ?? null,
    print_preview_url: row.print_preview_url ?? null,
  };
}

export function formatMoney(cents: number | null) {
  if (typeof cents !== 'number') return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export async function getWebsiteListing(id: string, viewerId?: string | null): Promise<WebsiteListing | null> {
  const supabase = createWebsiteAdminSupabaseClient();
  const { data: rows, error } = await supabase.rpc('get_public_listing', {
    p_listing_id: id,
    p_viewer_id: viewerId ?? null,
  });

  if (!error && rows && rows.length > 0) {
    return mapWebsiteListingRow(rows[0]);
  }

  if (!viewerId) return null;

  const { data: ownedAutograph, error: ownedError } = await supabase
    .from('autographs')
    .select(`
      id,
      certificate_id,
      created_at,
      creator_id,
      owner_id,
      sale_state,
      listing_mode,
      price_cents,
      prints_enabled,
      print_limit,
      video_url,
      thumbnail_url,
      creator_sequence_number,
      series_sequence_number,
      capture_width,
      capture_height,
      stroke_color,
      status,
      creator:creator_id ( display_name, verified ),
      owner:owner_id ( display_name ),
      series:series_id ( name, max_size )
    `)
    .eq('id', id)
    .eq('owner_id', viewerId)
    .eq('status', 'active')
    .maybeSingle();

  if (ownedError || !ownedAutograph) return null;

  return mapWebsiteListingRow({
    ...ownedAutograph,
    creator_display_name: (ownedAutograph as any).creator?.display_name ?? null,
    creator_verified: !!(ownedAutograph as any).creator?.verified,
    owner_display_name: (ownedAutograph as any).owner?.display_name ?? null,
    series_name: (ownedAutograph as any).series?.name ?? null,
    series_max_size: (ownedAutograph as any).series?.max_size ?? null,
  });
}

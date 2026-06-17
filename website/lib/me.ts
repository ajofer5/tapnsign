import { mapWebsiteListingRow } from './listings';
import { createWebsiteAdminSupabaseClient, createWebsiteServerSupabaseClient } from './supabase';

export type WebsiteOwnedListingsCursor = {
  beforeCreatedAt: string;
  beforeId: string;
};

export type WebsiteOwnedListingsPage = {
  listings: WebsiteMyListing[];
  nextCursor: WebsiteOwnedListingsCursor | null;
};

export type WebsiteMyListing = {
  id: string;
  creator_id: string;
  owner_id: string;
  certificate_id: string;
  created_at: string;
  thumbnail_url: string | null;
  video_url: string;
  capture_width: number | null;
  capture_height: number | null;
  stroke_color: string | null;
  creator_name: string;
  creator_sequence_number: number | null;
  series_name: string | null;
  series_sequence_number: number | null;
  series_max_size: number | null;
  sale_state: 'not_for_sale' | 'fixed';
  is_for_sale: boolean;
  price_cents: number | null;
  print_count: number | null;
  prints_enabled: boolean;
  print_limit: number | null;
};

export type WebsiteActivityEntry = {
  id: string;
  type:
    | 'personalized_request_received'
    | 'personalized_request_sent'
    | 'personalized_request_countered'
    | 'personalized_request_accepted'
    | 'personalized_request_declined'
    | 'personalized_request_withdrawn'
    | 'personalized_request_expired'
    | 'personalized_request_fulfilled'
    | 'personalized_request_completed'
    | 'print_ordered'
    | 'daily_print_summary'
    | 'verification_status'
    | 'payout_status';
  autograph_id: string | null;
  creator_name: string;
  creator_sequence_number: number | null;
  series_name: string | null;
  amount_cents: number;
  date: string;
  status?: string | null;
  expires_at?: string | null;
  payment_due_at?: string | null;
  personalized_request_id?: string | null;
  request_role?: 'creator' | 'requester';
  recipient_name?: string | null;
  completed_transfer_id?: string | null;
  print_quantity?: number | null;
  fulfillment_status?: string | null;
};

const HIDDEN_ACTIVITY_TYPES = new Set([
  'sold', 'purchased',
  'offer_received', 'offer_sent', 'offer_on_hold',
  'offer_accepted', 'offer_declined', 'offer_withdrawn', 'offer_expired',
]);

type WebsiteActivityFeedRow = {
  feed_id: string;
  event_type: string;
  autograph_id: string | null;
  creator_name: string;
  creator_sequence_number: number | null;
  series_name: string | null;
  amount_cents: number;
  event_at: string;
  status?: string | null;
  expires_at?: string | null;
  payment_due_at?: string | null;
  personalized_request_id?: string | null;
  request_role?: WebsiteActivityEntry['request_role'] | null;
  recipient_name?: string | null;
  completed_transfer_id?: string | null;
  print_quantity?: number | null;
  fulfillment_status?: string | null;
};

function mapMyListingRow(row: any): WebsiteMyListing {
  const base = mapWebsiteListingRow(row);
  return {
    ...base,
    series_name: base.series_name ?? null,
    series_max_size: base.series_max_size ?? null,
    print_count: base.print_count ?? null,
    prints_enabled: base.prints_enabled,
    print_limit: base.print_limit,
    creator_name: base.creator?.display_name ?? 'Creator',
    is_for_sale: !!row.is_for_sale,
  };
}

function getNextCursor<T extends { created_at: string; id: string }>(
  rows: T[],
  limit: number,
): WebsiteOwnedListingsCursor | null {
  if (rows.length < limit || rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return {
    beforeCreatedAt: last.created_at,
    beforeId: last.id,
  };
}

export function formatMoney(cents: number | null) {
  if (typeof cents !== 'number') return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export async function getMyListings(
  userId: string,
  limit = 24,
  cursor?: WebsiteOwnedListingsCursor | null,
): Promise<WebsiteOwnedListingsPage> {
  const supabase = await createWebsiteServerSupabaseClient();
  const pageLimit = Math.max(1, Math.min(limit, 100));
  const { data: rows, error } = await supabase.rpc('get_owned_listing_feed', {
    p_owner_id: userId,
    p_limit: pageLimit,
    p_before_created_at: cursor?.beforeCreatedAt ?? null,
    p_before_id: cursor?.beforeId ?? null,
  });

  const listings = (rows ?? []).map(mapMyListingRow);
  if (error) {
    return { listings: [], nextCursor: null };
  }

  return {
    listings,
    nextCursor: getNextCursor(rows ?? [], pageLimit),
  };
}

export async function getMyActivity(userId: string): Promise<WebsiteActivityEntry[]> {
  const supabase = createWebsiteAdminSupabaseClient();
  const { data, error } = await supabase.rpc('get_activity_feed', {
    p_user_id: userId,
    p_limit: 100,
    p_before_event_at: null,
    p_before_feed_id: null,
  });

  if (error || !data) {
    return [];
  }

  return (data as WebsiteActivityFeedRow[])
    .filter((row) => !HIDDEN_ACTIVITY_TYPES.has(row.event_type))
    .map((row) => ({
      id: row.feed_id,
      type: row.event_type as WebsiteActivityEntry['type'],
      autograph_id: row.autograph_id,
      creator_name: row.creator_name,
      creator_sequence_number: row.creator_sequence_number ?? null,
      series_name: row.series_name ?? null,
      amount_cents: row.amount_cents,
      date: row.event_at,
      status: row.status ?? undefined,
      expires_at: row.expires_at ?? undefined,
      payment_due_at: row.payment_due_at ?? undefined,
      personalized_request_id: row.personalized_request_id ?? undefined,
      request_role: row.request_role ?? undefined,
      recipient_name: row.recipient_name ?? undefined,
      completed_transfer_id: row.completed_transfer_id ?? undefined,
      print_quantity: row.print_quantity ?? undefined,
      fulfillment_status: row.fulfillment_status ?? undefined,
    }));
}

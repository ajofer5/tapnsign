import { mapWebsiteListingRow } from './listings';
import { createWebsiteAdminSupabaseClient } from './supabase';

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
  listing_mode: 'buy_now' | 'make_offer';
  is_for_sale: boolean;
  price_cents: number | null;
  auto_decline_below: boolean;
  auto_accept_above: boolean;
  offer_locked_until: string | null;
};

export type WebsiteIncomingOffer = {
  id: string;
  autograph_id: string;
  amount_cents: number;
  status: 'pending' | 'accepted' | 'on_hold';
  expires_at: string | null;
  payment_due_at: string | null;
  created_at: string;
  creator_name: string;
  creator_sequence_number: number | null;
};

export type WebsiteOfferQueueGroup = {
  autograph_id: string;
  autograph: WebsiteMyListing | null;
  accepted: WebsiteIncomingOffer | null;
  on_hold: WebsiteIncomingOffer[];
  pending: WebsiteIncomingOffer[];
};

export type WebsiteOfferQueueCursor = {
  beforeHeadlineAmount: number;
  beforeHeadlineCreatedAt: string;
  beforeAutographId: string;
};

export type WebsiteOfferQueuePage = {
  groups: WebsiteOfferQueueGroup[];
  nextCursor: WebsiteOfferQueueCursor | null;
};

export type WebsiteActivityEntry = {
  id: string;
  type:
    | 'sold'
    | 'purchased'
    | 'offer_received'
    | 'offer_sent'
    | 'offer_on_hold'
    | 'offer_accepted'
    | 'offer_declined'
    | 'offer_withdrawn'
    | 'offer_expired';
  autograph_id: string;
  creator_name: string;
  creator_sequence_number: number | null;
  series_name: string | null;
  amount_cents: number;
  date: string;
  status?: 'pending' | 'accepted' | 'on_hold' | 'declined' | 'withdrawn' | 'expired';
  offer_role?: 'owner' | 'buyer';
  expires_at?: string | null;
  payment_due_at?: string | null;
  accepted_transfer_id?: string | null;
};

function mapMyListingRow(row: any): WebsiteMyListing {
  const base = mapWebsiteListingRow(row);
  return {
    ...base,
    series_name: base.series_name ?? null,
    series_max_size: base.series_max_size ?? null,
    offer_locked_until: base.offer_locked_until ?? null,
    creator_name: base.creator?.display_name ?? 'Creator',
    is_for_sale: !!row.is_for_sale,
    auto_decline_below: !!row.auto_decline_below,
    auto_accept_above: !!row.auto_accept_above,
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

export function getListingModeLabel(mode: 'buy_now' | 'make_offer') {
  return mode === 'buy_now' ? 'Fixed Price' : 'Estimated Value';
}

export async function getMyListings(
  userId: string,
  limit = 24,
  cursor?: WebsiteOwnedListingsCursor | null,
): Promise<WebsiteOwnedListingsPage> {
  const supabase = createWebsiteAdminSupabaseClient();
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

export async function getMyOfferQueue(
  userId: string,
  limit = 24,
  cursor?: WebsiteOfferQueueCursor | null,
): Promise<WebsiteOfferQueuePage> {
  const supabase = createWebsiteAdminSupabaseClient();
  const pageLimit = Math.max(1, Math.min(limit, 100));
  const { data: rows, error } = await supabase.rpc('get_offer_queue_feed', {
    p_owner_id: userId,
    p_limit: pageLimit,
    p_before_headline_amount: cursor?.beforeHeadlineAmount ?? null,
    p_before_headline_created_at: cursor?.beforeHeadlineCreatedAt ?? null,
    p_before_autograph_id: cursor?.beforeAutographId ?? null,
  });

  if (error || !rows) {
    return { groups: [], nextCursor: null };
  }

  const autographMap = new Map<string, WebsiteMyListing>();
  const grouped = new Map<string, WebsiteIncomingOffer[]>();
  const groupCursorMap = new Map<string, WebsiteOfferQueueCursor>();

  for (const row of rows) {
    if (!autographMap.has(row.autograph_id)) {
      autographMap.set(row.autograph_id, mapMyListingRow({
        ...row,
        id: row.autograph_id,
        created_at: row.autograph_created_at,
      }));
    }
    if (!groupCursorMap.has(row.autograph_id)) {
      groupCursorMap.set(row.autograph_id, {
        beforeHeadlineAmount: row.headline_amount_cents,
        beforeHeadlineCreatedAt: row.headline_created_at,
        beforeAutographId: row.autograph_id,
      });
    }
    const current = grouped.get(row.autograph_id) ?? [];
    current.push({
      id: row.offer_id,
      autograph_id: row.autograph_id,
      amount_cents: row.amount_cents,
      status: row.status,
      expires_at: row.expires_at ?? null,
      payment_due_at: row.payment_due_at ?? null,
      created_at: row.created_at,
      creator_name: row.creator_name ?? 'Creator',
      creator_sequence_number: row.creator_sequence_number ?? null,
    });
    grouped.set(row.autograph_id, current);
  }

  const groups = Array.from(grouped.entries()).map(([autographId, groupedOffers]) => ({
    autograph_id: autographId,
    autograph: autographMap.get(autographId) ?? null,
    accepted: groupedOffers.find((offer) => offer.status === 'accepted') ?? null,
    on_hold: groupedOffers
      .filter((offer) => offer.status === 'on_hold')
      .sort((a, b) => b.amount_cents - a.amount_cents || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    pending: groupedOffers
      .filter((offer) => offer.status === 'pending')
      .sort((a, b) => b.amount_cents - a.amount_cents || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
  }));

  const lastGroup = groups.length > 0 ? groups[groups.length - 1] : null;
  const nextCursor = groups.length < pageLimit || !lastGroup
    ? null
    : (groupCursorMap.get(lastGroup.autograph_id) ?? null);

  return { groups, nextCursor };
}

function parseAutographLabel(autograph: any) {
  return {
    creatorName: autograph?.creator?.display_name ?? 'Unknown',
    creatorSequenceNumber: autograph?.creator_sequence_number ?? null,
    seriesName: autograph?.series?.name ?? null,
  };
}

export async function getMyActivity(userId: string): Promise<WebsiteActivityEntry[]> {
  const supabase = createWebsiteAdminSupabaseClient();
  const [transfersRes, offersRes] = await Promise.all([
    supabase
      .from('transfers')
      .select(
        'id, autograph_id, from_user_id, to_user_id, price_cents, transferred_at, autograph:autograph_id ( creator_sequence_number, creator:creator_id ( display_name ), series:series_id ( name ) )'
      )
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order('transferred_at', { ascending: false }),
    supabase
      .from('autograph_offers')
      .select(
        'id, autograph_id, buyer_id, owner_id, amount_cents, status, created_at, responded_at, expires_at, payment_due_at, accepted_transfer_id, autograph:autograph_id ( creator_sequence_number, creator:creator_id ( display_name ), series:series_id ( name ) )'
      )
      .or(`buyer_id.eq.${userId},owner_id.eq.${userId}`)
      .order('created_at', { ascending: false }),
  ]);

  const results: WebsiteActivityEntry[] = [];

  for (const transfer of transfersRes.data ?? []) {
    const { creatorName, creatorSequenceNumber, seriesName } = parseAutographLabel(transfer.autograph);
    if (transfer.from_user_id === userId) {
      results.push({
        id: `transfer-sold-${transfer.id}`,
        type: 'sold',
        autograph_id: transfer.autograph_id,
        creator_name: creatorName,
        creator_sequence_number: creatorSequenceNumber,
        series_name: seriesName,
        amount_cents: transfer.price_cents,
        date: transfer.transferred_at,
      });
    } else {
      results.push({
        id: `transfer-purchased-${transfer.id}`,
        type: 'purchased',
        autograph_id: transfer.autograph_id,
        creator_name: creatorName,
        creator_sequence_number: creatorSequenceNumber,
        series_name: seriesName,
        amount_cents: transfer.price_cents,
        date: transfer.transferred_at,
      });
    }
  }

  for (const offer of offersRes.data ?? []) {
    const { creatorName, creatorSequenceNumber, seriesName } = parseAutographLabel(offer.autograph);
    const isOwner = offer.owner_id === userId;
    let type: WebsiteActivityEntry['type'];

    if (offer.status === 'pending') {
      type = isOwner ? 'offer_received' : 'offer_sent';
    } else if (offer.status === 'accepted') {
      type = 'offer_accepted';
    } else if (offer.status === 'on_hold') {
      type = 'offer_on_hold';
    } else if (offer.status === 'declined') {
      type = 'offer_declined';
    } else if (offer.status === 'withdrawn') {
      type = 'offer_withdrawn';
    } else {
      type = 'offer_expired';
    }

    results.push({
      id: `offer-${offer.id}`,
      type,
      autograph_id: offer.autograph_id,
      creator_name: creatorName,
      creator_sequence_number: creatorSequenceNumber,
      series_name: seriesName,
      amount_cents: offer.amount_cents,
      date: offer.responded_at ?? offer.created_at,
      status: offer.status,
      offer_role: isOwner ? 'owner' : 'buyer',
      expires_at: offer.expires_at,
      payment_due_at: offer.payment_due_at,
      accepted_transfer_id: offer.accepted_transfer_id,
    });
  }

  results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return results;
}

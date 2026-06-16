import { createWebsiteAdminSupabaseClient, createWebsiteServerSupabaseClient } from './supabase';
import { mapWebsiteListingRow, type WebsiteListing } from './listings';

export type WebsiteSavedListingsCursor = {
  beforeSavedAt: string;
  beforeAutographId: string;
};

export type WebsiteSavedListingsPage = {
  listings: WebsiteListing[];
  nextCursor: WebsiteSavedListingsCursor | null;
};

export type WebsiteSavedCreator = {
  saved_at: string;
  creator_id: string;
  display_name: string;
  avatar_url: string | null;
  verified: boolean;
  name_verified: boolean;
  bio: string | null;
  personalized_requests_enabled: boolean;
  print_count: number;
};

export type WebsiteSavedCreatorsCursor = {
  beforeSavedAt: string;
  beforeCreatorId: string;
};

export type WebsiteSavedCreatorsPage = {
  creators: WebsiteSavedCreator[];
  nextCursor: WebsiteSavedCreatorsCursor | null;
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
  const supabase = await createWebsiteServerSupabaseClient();
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

export async function getSavedCreators(
  userId: string,
  limit = 24,
  cursor?: WebsiteSavedCreatorsCursor | null,
): Promise<WebsiteSavedCreatorsPage> {
  const supabase = await createWebsiteServerSupabaseClient();
  const pageLimit = Math.max(1, Math.min(limit, 100));
  const { data: rows, error } = await supabase.rpc('get_saved_creators_feed', {
    p_user_id: userId,
    p_limit: pageLimit,
    p_before_saved_at: cursor?.beforeSavedAt ?? null,
    p_before_creator_id: cursor?.beforeCreatorId ?? null,
  });

  if (error || !rows) {
    return { creators: [], nextCursor: null };
  }

  const creators = rows.map((row: any): WebsiteSavedCreator => ({
    saved_at: row.saved_at,
    creator_id: row.creator_id,
    display_name: row.display_name ?? 'Creator',
    avatar_url: row.avatar_url ?? null,
    verified: !!row.verified,
    name_verified: !!row.name_verified,
    bio: row.bio ?? null,
    personalized_requests_enabled: !!row.personalized_requests_enabled,
    print_count: Number(row.print_count ?? 0),
  }));
  const last = rows.length > 0 ? rows[rows.length - 1] : null;

  return {
    creators,
    nextCursor: rows.length < pageLimit || !last
      ? null
      : {
          beforeSavedAt: last.saved_at,
          beforeCreatorId: last.creator_id,
        },
  };
}

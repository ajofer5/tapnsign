import { createWebsiteAdminSupabaseClient } from './supabase';

export type WebsiteAcceptedOffer = {
  id: string;
  autograph_id: string;
  buyer_id: string;
  owner_id: string;
  amount_cents: number;
  status: 'pending' | 'accepted' | 'on_hold' | 'declined' | 'withdrawn' | 'expired';
  payment_due_at: string | null;
  accepted_transfer_id: string | null;
  payment_event_id: string | null;
  autograph: {
    certificate_id: string;
    creator_id: string;
    creator_sequence_number: number | null;
    creator_name: string;
    series_name: string | null;
    series_sequence_number: number | null;
    series_max_size: number | null;
    thumbnail_url: string | null;
    video_url: string | null;
    status: string;
    owner_id: string;
  };
};

export async function getAcceptedOffer(offerId: string): Promise<WebsiteAcceptedOffer | null> {
  const supabase = createWebsiteAdminSupabaseClient();
  const { data } = await supabase
    .from('autograph_offers')
    .select(`
      id,
      autograph_id,
      buyer_id,
      owner_id,
      amount_cents,
      status,
      payment_due_at,
      accepted_transfer_id,
      payment_event_id,
      autograph:autograph_id (
        certificate_id,
        creator_id,
        creator_sequence_number,
        thumbnail_url,
        video_url,
        status,
        owner_id,
        creator:creator_id ( display_name ),
        series:series_id ( name, max_size ),
        series_sequence_number
      )
    `)
    .eq('id', offerId)
    .maybeSingle();

  if (!data) return null;

  const autograph = (data as any).autograph;
  return {
    id: (data as any).id,
    autograph_id: (data as any).autograph_id,
    buyer_id: (data as any).buyer_id,
    owner_id: (data as any).owner_id,
    amount_cents: (data as any).amount_cents,
    status: (data as any).status,
    payment_due_at: (data as any).payment_due_at,
    accepted_transfer_id: (data as any).accepted_transfer_id,
    payment_event_id: (data as any).payment_event_id,
    autograph: {
      certificate_id: autograph?.certificate_id,
      creator_id: autograph?.creator_id,
      creator_sequence_number: autograph?.creator_sequence_number ?? null,
      creator_name: autograph?.creator?.display_name ?? 'Creator',
      series_name: autograph?.series?.name ?? null,
      series_sequence_number: autograph?.series_sequence_number ?? null,
      series_max_size: autograph?.series?.max_size ?? null,
      thumbnail_url: autograph?.thumbnail_url ?? null,
      video_url: autograph?.video_url ?? null,
      status: autograph?.status ?? 'inactive',
      owner_id: autograph?.owner_id,
    },
  };
}

import { createWebsiteAdminSupabaseClient } from './supabase';

export type WebsitePersonalizedRequest = {
  id: string;
  creator_id: string;
  requester_id: string;
  buyer_commitment_id: string | null;
  minted_autograph_id: string | null;
  recipient_name: string;
  inscription_text: string | null;
  requester_note: string | null;
  amount_cents: number;
  status: 'pending' | 'countered' | 'accepted' | 'declined' | 'withdrawn' | 'expired' | 'fulfilled' | 'completed';
  payment_due_at: string | null;
  authorization_payment_event_id: string | null;
  payment_event_id: string | null;
  completed_transfer_id: string | null;
  autograph: {
    id: string;
    certificate_id: string;
    creator_id: string;
    creator_name: string;
    creator_sequence_number: number | null;
    thumbnail_url: string | null;
    video_url: string | null;
    status: string;
    owner_id: string;
    personalized_recipient_name: string | null;
    personalized_inscription_text: string | null;
  } | null;
};

export type WebsitePersonalizedRequestListItem = {
  id: string;
  creator_id: string;
  requester_id: string;
  minted_autograph_id: string | null;
  recipient_name: string;
  inscription_text: string | null;
  requester_note: string | null;
  amount_cents: number;
  counter_amount_cents: number | null;
  status: WebsitePersonalizedRequest['status'];
  expires_at: string;
  payment_due_at: string | null;
  completed_transfer_id: string | null;
  accepted_at: string | null;
  responded_at: string | null;
  fulfilled_at: string | null;
  completed_at: string | null;
  created_at: string;
  creator_name: string;
  requester_name: string;
  autograph_thumbnail_url: string | null;
  autograph_certificate_id: string | null;
};

export async function getPersonalizedRequest(id: string): Promise<WebsitePersonalizedRequest | null> {
  const supabase = createWebsiteAdminSupabaseClient();
  const { data } = await supabase
    .from('personalized_autograph_requests')
    .select(`
      id,
      creator_id,
      requester_id,
      buyer_commitment_id,
      minted_autograph_id,
      recipient_name,
      inscription_text,
      requester_note,
      amount_cents,
      status,
      payment_due_at,
      authorization_payment_event_id,
      payment_event_id,
      completed_transfer_id,
      autograph:minted_autograph_id (
        id,
        certificate_id,
        creator_id,
        creator_sequence_number,
        thumbnail_url,
        video_url,
        status,
        owner_id,
        personalized_recipient_name,
        personalized_inscription_text,
        creator:creator_id ( display_name )
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (!data) return null;

  const autograph = (data as any).autograph;
  return {
    id: (data as any).id,
    creator_id: (data as any).creator_id,
    requester_id: (data as any).requester_id,
    buyer_commitment_id: (data as any).buyer_commitment_id ?? null,
    minted_autograph_id: (data as any).minted_autograph_id ?? null,
    recipient_name: (data as any).recipient_name,
    inscription_text: (data as any).inscription_text ?? null,
    requester_note: (data as any).requester_note ?? null,
    amount_cents: (data as any).amount_cents,
    status: (data as any).status,
    payment_due_at: (data as any).payment_due_at ?? null,
    authorization_payment_event_id: (data as any).authorization_payment_event_id ?? null,
    payment_event_id: (data as any).payment_event_id ?? null,
    completed_transfer_id: (data as any).completed_transfer_id ?? null,
    autograph: autograph
      ? {
          id: autograph.id,
          certificate_id: autograph.certificate_id,
          creator_id: autograph.creator_id,
          creator_name: autograph.creator?.display_name ?? 'Creator',
          creator_sequence_number: autograph.creator_sequence_number ?? null,
          thumbnail_url: autograph.thumbnail_url ?? null,
          video_url: autograph.video_url ?? null,
          status: autograph.status ?? 'inactive',
          owner_id: autograph.owner_id,
          personalized_recipient_name: autograph.personalized_recipient_name ?? null,
          personalized_inscription_text: autograph.personalized_inscription_text ?? null,
        }
      : null,
  };
}

export async function getMyPersonalizedRequests(userId: string): Promise<{
  incoming: WebsitePersonalizedRequestListItem[];
  outgoing: WebsitePersonalizedRequestListItem[];
}> {
  const supabase = createWebsiteAdminSupabaseClient();
  const { data } = await supabase
    .from('personalized_autograph_requests')
    .select(`
      id,
      creator_id,
      requester_id,
      minted_autograph_id,
      recipient_name,
      inscription_text,
      requester_note,
      amount_cents,
      counter_amount_cents,
      status,
      expires_at,
      payment_due_at,
      completed_transfer_id,
      accepted_at,
      responded_at,
      fulfilled_at,
      completed_at,
      created_at,
      creator:creator_id ( display_name ),
      requester:requester_id ( display_name ),
      autograph:minted_autograph_id (
        certificate_id,
        thumbnail_url
      )
    `)
    .or(`creator_id.eq.${userId},requester_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  const items: WebsitePersonalizedRequestListItem[] = (data ?? []).map((row: any) => ({
    id: row.id,
    creator_id: row.creator_id,
    requester_id: row.requester_id,
    minted_autograph_id: row.minted_autograph_id ?? null,
    recipient_name: row.recipient_name,
    inscription_text: row.inscription_text ?? null,
    requester_note: row.requester_note ?? null,
    amount_cents: row.amount_cents,
    counter_amount_cents: row.counter_amount_cents ?? null,
    status: row.status,
    expires_at: row.expires_at,
    payment_due_at: row.payment_due_at ?? null,
    completed_transfer_id: row.completed_transfer_id ?? null,
    accepted_at: row.accepted_at ?? null,
    responded_at: row.responded_at ?? null,
    fulfilled_at: row.fulfilled_at ?? null,
    completed_at: row.completed_at ?? null,
    created_at: row.created_at,
    creator_name: row.creator?.display_name ?? 'Creator',
    requester_name: row.requester?.display_name ?? 'Collector',
    autograph_thumbnail_url: row.autograph?.thumbnail_url ?? null,
    autograph_certificate_id: row.autograph?.certificate_id ?? null,
  }));

  return {
    incoming: items.filter((item) => item.creator_id === userId),
    outgoing: items.filter((item) => item.requester_id === userId),
  };
}

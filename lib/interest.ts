import { supabase } from './supabase';

type InterestEventType = 'view_autograph' | 'view_profile';

type LogInterestParams = {
  autographId?: string | null;
  creatorId?: string | null;
  seriesId?: string | null;
};

export async function logInterestEvent(
  eventType: InterestEventType,
  params: LogInterestParams = {}
) {
  try {
    await supabase.rpc('log_interest_event', {
      p_event_type: eventType,
      p_autograph_id: params.autographId ?? null,
      p_creator_id: params.creatorId ?? null,
      p_series_id: params.seriesId ?? null,
    });
  } catch {}
}

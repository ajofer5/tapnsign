import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendPushNotification(token: string, title: string, body: string) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Find auctions ending in the next 1 hour that haven't been notified yet
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    const { data: auctions } = await supabase
      .from('autographs')
      .select('id, auction_ends_at, celebrity:celebrity_id ( display_name )')
      .eq('is_for_sale', true)
      .eq('listing_type', 'auction')
      .gte('auction_ends_at', now.toISOString())
      .lte('auction_ends_at', oneHourFromNow.toISOString());

    let notified = 0;

    for (const auction of auctions ?? []) {
      const celebrityName = (auction.celebrity as any)?.display_name ?? 'an autograph';

      // Get all unique bidders on this auction
      const { data: bids } = await supabase
        .from('bids')
        .select('bidder_id')
        .eq('autograph_id', auction.id);

      const bidderIds = [...new Set((bids ?? []).map((b: any) => b.bidder_id))];
      if (!bidderIds.length) continue;

      // Get their push tokens
      const { data: tokens } = await supabase
        .from('push_tokens')
        .select('token')
        .in('user_id', bidderIds);

      for (const row of tokens ?? []) {
        await sendPushNotification(
          row.token,
          'Auction ending soon!',
          `Less than 1 hour left to bid on ${celebrityName}.`
        );
        notified++;
      }
    }

    return new Response(JSON.stringify({ notified }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

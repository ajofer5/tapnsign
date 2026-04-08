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
    const { autograph_id, new_bid_cents, new_bidder_id } = await req.json();

    // Find the previous top bidder (highest bid excluding the new one)
    const { data: prevBids } = await supabase
      .from('bids')
      .select('bidder_id, amount_cents')
      .eq('autograph_id', autograph_id)
      .neq('bidder_id', new_bidder_id)
      .order('amount_cents', { ascending: false })
      .limit(1);

    const prevBidder = prevBids?.[0];
    if (!prevBidder) {
      return new Response(JSON.stringify({ sent: false, reason: 'no previous bidder' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get their push token
    const { data: tokenRow } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', prevBidder.bidder_id)
      .maybeSingle();

    if (!tokenRow?.token) {
      return new Response(JSON.stringify({ sent: false, reason: 'no push token' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get autograph celebrity name
    const { data: autograph } = await supabase
      .from('autographs')
      .select('celebrity:celebrity_id ( display_name )')
      .eq('id', autograph_id)
      .maybeSingle();

    const celebrityName = (autograph?.celebrity as any)?.display_name ?? 'this autograph';
    const newBidDollars = `$${(new_bid_cents / 100).toFixed(2)}`;

    await sendPushNotification(
      tokenRow.token,
      "You've been outbid!",
      `Someone bid ${newBidDollars} on ${celebrityName}. Place a higher bid to stay in the lead.`
    );

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

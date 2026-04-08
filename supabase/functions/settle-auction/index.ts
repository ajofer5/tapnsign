import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

// Service role key bypasses RLS so we can update any row
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendPush(token: string, title: string, body: string) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  }).catch(() => {});
}

async function getToken(userId: string): Promise<string | null> {
  const { data } = await supabase.from('push_tokens').select('token').eq('user_id', userId).maybeSingle();
  return data?.token ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Find all ended auctions that are still listed for sale
    const { data: auctions, error: auctionError } = await supabase
      .from('autographs')
      .select('id, reserve_price_cents, celebrity_id')
      .eq('is_for_sale', true)
      .eq('listing_type', 'auction')
      .lt('auction_ends_at', new Date().toISOString());

    if (auctionError) throw auctionError;

    let settled = 0;
    let unsold = 0;

    for (const auction of auctions ?? []) {
      // Get the top bid for this auction
      const { data: topBid } = await supabase
        .from('bids')
        .select('id, bidder_id, amount_cents, payment_intent_id')
        .eq('autograph_id', auction.id)
        .order('amount_cents', { ascending: false })
        .limit(1)
        .maybeSingle();

      const reserveMet =
        topBid &&
        topBid.amount_cents >= (auction.reserve_price_cents ?? 0);

      if (!reserveMet || !topBid?.payment_intent_id) {
        // No qualifying bid — unlist without charging
        await supabase
          .from('autographs')
          .update({ is_for_sale: false })
          .eq('id', auction.id);

        // Cancel any payment intents that exist (bids without reserve met)
        if (topBid) {
          const { data: allBids } = await supabase
            .from('bids')
            .select('payment_intent_id')
            .eq('autograph_id', auction.id)
            .not('payment_intent_id', 'is', null);

          for (const bid of allBids ?? []) {
            await stripe.paymentIntents.cancel(bid.payment_intent_id!).catch(() => {});
          }
        }

        unsold++;
        continue;
      }

      // Capture the winning payment
      try {
        await stripe.paymentIntents.capture(topBid.payment_intent_id);
      } catch (captureError: any) {
        console.error(`Failed to capture payment for auction ${auction.id}:`, captureError.message);
        // Skip this auction — will retry next cron cycle
        continue;
      }

      // Transfer ownership to the winner
      await supabase
        .from('autographs')
        .update({ owner_id: topBid.bidder_id, is_for_sale: false })
        .eq('id', auction.id);

      await supabase.from('transfers').insert({
        autograph_id: auction.id,
        from_user_id: auction.celebrity_id,
        to_user_id: topBid.bidder_id,
        price_cents: topBid.amount_cents,
      });

      // Cancel all losing bids' payment authorizations and notify losers
      const { data: losingBids } = await supabase
        .from('bids')
        .select('id, bidder_id, payment_intent_id')
        .eq('autograph_id', auction.id)
        .neq('id', topBid.id);

      const celebrityName = (auction as any).celebrity_name ?? 'the autograph';

      for (const loser of losingBids ?? []) {
        if (loser.payment_intent_id) {
          await stripe.paymentIntents.cancel(loser.payment_intent_id).catch(() => {});
        }
        const loserToken = await getToken(loser.bidder_id);
        if (loserToken) {
          await sendPush(loserToken, 'Auction ended', `The auction ended — you were outbid on ${celebrityName}.`);
        }
      }

      // Notify the winner
      const winnerToken = await getToken(topBid.bidder_id);
      if (winnerToken) {
        const amount = `$${(topBid.amount_cents / 100).toFixed(2)}`;
        await sendPush(winnerToken, 'You won the auction!', `Congratulations! You won ${celebrityName} for ${amount}.`);
      }

      // Clean up all bids for this auction
      await supabase.from('bids').delete().eq('autograph_id', auction.id);

      settled++;
    }

    return new Response(
      JSON.stringify({ settled, unsold }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('settle-auction error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

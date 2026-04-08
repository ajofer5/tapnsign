import { handleRequest, json, parseJson, requireInternalRequest, requirePositiveInteger, requireString, sendExpoPush, supabaseAdmin } from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    requireInternalRequest(request);

    const body = await parseJson(request);
    const autographId = requireString(body.autograph_id, 'autograph_id');
    const newBidCents = requirePositiveInteger(body.new_bid_cents, 'new_bid_cents');
    const newBidderId = requireString(body.new_bidder_id, 'new_bidder_id');

    const { data: prevBids } = await supabaseAdmin
      .from('bids')
      .select('bidder_id, amount_cents')
      .eq('autograph_id', autographId)
      .neq('bidder_id', newBidderId)
      .in('status', ['active', 'outbid'])
      .order('amount_cents', { ascending: false })
      .limit(1);

    const prevBidder = prevBids?.[0];
    if (!prevBidder) {
      return json({ sent: false, reason: 'no previous bidder' });
    }

    const { data: tokenRow } = await supabaseAdmin
      .from('push_tokens')
      .select('token')
      .eq('user_id', prevBidder.bidder_id)
      .maybeSingle();

    if (!tokenRow?.token) {
      return json({ sent: false, reason: 'no push token' });
    }

    await sendExpoPush(
      tokenRow.token,
      "You've been outbid!",
      `Someone bid $${(newBidCents / 100).toFixed(2)}. Place a higher bid to stay in the lead.`
    );

    return json({ sent: true });
  }, req)
);

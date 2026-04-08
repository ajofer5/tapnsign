import { handleRequest, json, requireInternalRequest, sendExpoPush, supabaseAdmin } from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    requireInternalRequest(request);

    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    const { data: auctions, error } = await supabaseAdmin
      .from('autographs')
      .select('id, auction_ends_at')
      .eq('is_for_sale', true)
      .eq('listing_type', 'auction')
      .gte('auction_ends_at', now.toISOString())
      .lte('auction_ends_at', oneHourFromNow.toISOString());

    if (error) {
      throw new Error(error.message);
    }

    let notified = 0;

    for (const auction of auctions ?? []) {
      const { data: bids } = await supabaseAdmin
        .from('bids')
        .select('bidder_id')
        .eq('autograph_id', auction.id)
        .in('status', ['active', 'outbid']);

      const bidderIds = [...new Set((bids ?? []).map((b: any) => b.bidder_id))];
      if (!bidderIds.length) continue;

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .in('user_id', bidderIds);

      for (const row of tokens ?? []) {
        await sendExpoPush(
          row.token,
          'Auction ending soon!',
          'Less than 1 hour left to bid on a watched autograph.'
        );
        notified++;
      }
    }

    return json({ notified });
  }, req)
);

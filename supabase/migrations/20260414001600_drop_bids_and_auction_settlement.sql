-- Drop the remaining auction settlement machinery now that auctions are removed
-- from the active TapnSign runtime.

drop function if exists public.rpc_place_bid(uuid, uuid);
drop function if exists public.rpc_start_auction_settlement(uuid);
drop function if exists public.rpc_finalize_auction_settlement(uuid, uuid, boolean, uuid[]);

drop index if exists public.autographs_auction_settlement_status_idx;

alter table public.autographs
  drop constraint if exists autographs_auction_settlement_status_check;

alter table public.autographs
  drop column if exists auction_settlement_bid_id,
  drop column if exists auction_settlement_status,
  drop column if exists auction_settlement_at;

drop table if exists public.bids;

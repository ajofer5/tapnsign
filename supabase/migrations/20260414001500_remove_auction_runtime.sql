-- Remove auctions from the active TapnSign runtime.
-- Existing auction listings revert to not-for-sale so the app no longer surfaces them.

update public.autographs
set
  sale_state = 'not_for_sale',
  is_for_sale = false,
  listing_type = null,
  reserve_price_cents = null,
  auction_ends_at = null,
  auction_settlement_status = 'none',
  auction_settlement_bid_id = null
where listing_type = 'auction'
   or sale_state = 'auction';

import { HttpError, assert, createTransfer, getAutographForUpdate, getProfile, supabaseAdmin } from './utils.ts';

export async function requireVerifiedUser(userId: string) {
  const profile = await getProfile(userId);
  assert(!profile.suspended_at, 403, 'Account is suspended.');
  assert(profile.role === 'verified' && profile.verification_status === 'verified', 403, 'Verified account required.');
  return profile;
}

export async function requireActiveOwnedAutograph(autographId: string, ownerId: string) {
  const autograph = await getAutographForUpdate(autographId);
  assert(autograph.status === 'active', 409, 'Autograph is not active.');
  assert(autograph.owner_id === ownerId, 403, 'You do not own this autograph.');
  return autograph;
}

export async function updateAutographListing(params: {
  autographId: string;
  isForSale: boolean;
  listingType: 'fixed' | 'auction' | null;
  priceCents?: number | null;
  reservePriceCents?: number | null;
  auctionEndsAt?: string | null;
  openToTrade?: boolean;
}) {
  const payload = {
    is_for_sale: params.isForSale,
    listing_type: params.listingType,
    price_cents: params.priceCents ?? null,
    reserve_price_cents: params.reservePriceCents ?? null,
    auction_ends_at: params.auctionEndsAt ?? null,
    open_to_trade: params.openToTrade ?? false,
  };

  const { data, error } = await supabaseAdmin
    .from('autographs')
    .update(payload)
    .eq('id', params.autographId)
    .select('id')
    .single();

  if (error || !data) {
    throw new HttpError(500, error?.message ?? 'Could not update autograph listing.');
  }
}

export async function transferAutographOwnership(params: {
  autographId: string;
  fromUserId: string;
  toUserId: string;
  ownershipSource: 'purchase' | 'auction' | 'trade' | 'admin';
  transferType: 'primary_sale' | 'secondary_sale' | 'trade' | 'admin_adjustment' | 'gift';
  priceCents?: number | null;
  tradeOfferId?: string | null;
  paymentEventId?: string | null;
}) {
  const transferId = await createTransfer({
    autographId: params.autographId,
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
    transferType: params.transferType,
    priceCents: params.priceCents ?? null,
    tradeOfferId: params.tradeOfferId ?? null,
    paymentEventId: params.paymentEventId ?? null,
  });

  const { data, error } = await supabaseAdmin
    .from('autographs')
    .update({
      owner_id: params.toUserId,
      ownership_source: params.ownershipSource,
      latest_transfer_id: transferId,
      is_for_sale: false,
      listing_type: null,
      price_cents: null,
      reserve_price_cents: null,
      auction_ends_at: null,
      open_to_trade: false,
    })
    .eq('id', params.autographId)
    .eq('owner_id', params.fromUserId)
    .select('id')
    .single();

  if (error || !data) {
    throw new HttpError(409, error?.message ?? 'Autograph ownership changed before transfer could complete.');
  }

  return transferId;
}

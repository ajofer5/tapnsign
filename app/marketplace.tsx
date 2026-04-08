import { BrandColors, BrandFonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { callEdgeFunction } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useStripe } from '@stripe/stripe-react-native';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

type Point = { x: number; y: number; t: number };
type Stroke = { id: string; points: Point[] };

type ListingItem = {
  id: string;
  certificateId: string;
  createdAt: string;
  priceCents: number | null;
  listingType: 'fixed' | 'auction';
  reservePriceCents: number | null;
  auctionEndsAt: string | null;
  topBidCents: number | null;
  topBidderId: string | null;
  videoUri: string;
  strokes: Stroke[];
  captureWidth: number;
  captureHeight: number;
  celebrityId: string;
  ownerId: string;
  isForSale: boolean;
  openToTrade: boolean;
  celebrity: {
    display_name: string;
    verified: boolean;
  };
};

type MyAutograph = {
  id: string;
  celebrityName: string;
  createdAt: string;
};

type TradeOffer = {
  id: string;
  offererName: string;
  offeredAutographId: string;
  offeredAutographCelebrity: string;
  targetAutographId: string;
  createdAt: string;
};

function formatPrice(cents: number | null) {
  if (!cents) return '$0.00';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTimeLeft(endsAt: string | null) {
  if (!endsAt) return '';
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const hours = Math.floor(ms / 3600000);
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function SignatureOverlay({
  strokes, currentTimeSeconds, sourceWidth, sourceHeight, displayWidth, displayHeight,
}: {
  strokes: Stroke[]; currentTimeSeconds: number;
  sourceWidth: number; sourceHeight: number;
  displayWidth: number; displayHeight: number;
}) {
  const scaleX = displayWidth / (sourceWidth || 1);
  const scaleY = displayHeight / (sourceHeight || 1);

  return (
    <Svg width={displayWidth} height={displayHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
      {strokes.map((stroke) => {
        const visible = stroke.points.filter((p) => p.t <= currentTimeSeconds);
        if (!visible.length) return null;
        const d = visible.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * scaleX} ${p.y * scaleY}`).join(' ');
        return (
          <Path key={stroke.id} d={d} stroke="red" strokeWidth={5}
            fill="none" strokeLinecap="round" strokeLinejoin="round" />
        );
      })}
    </Svg>
  );
}

function PreviewPlayer({ item }: { item: ListingItem }) {
  const [box, setBox] = useState({ width: 1, height: 1 });
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rotation, setRotation] = useState(0);
  const videoRef = useRef<Video | null>(null);
  const isRotated = rotation === 90 || rotation === -90;

  const handleStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPlaybackTime(status.positionMillis / 1000);
    setIsPlaying(status.isPlaying);
  };

  const togglePlay = async () => {
    if (!videoRef.current) return;
    const s = await videoRef.current.getStatusAsync();
    if (!s.isLoaded) return;
    s.isPlaying ? await videoRef.current.pauseAsync() : await videoRef.current.playAsync();
  };

  const restart = async () => {
    if (!videoRef.current) return;
    await videoRef.current.setPositionAsync(0);
    await videoRef.current.playAsync();
  };

  return (
    <>
      <View
        style={styles.videoWrapper}
        onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        <View style={styles.videoLayer}>
          <Video
            ref={videoRef}
            source={{ uri: item.videoUri }}
            style={[
              styles.video,
              isRotated && { width: box.height, height: box.width },
              rotation !== 0 && { transform: [{ rotate: `${rotation}deg` }] },
            ]}
            useNativeControls={false}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
            onReadyForDisplay={({ naturalSize }) => {
              setRotation(naturalSize.height > naturalSize.width ? 90 : 0);
            }}
            onPlaybackStatusUpdate={handleStatus}
          />
        </View>
        <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject as any }}>
          <SignatureOverlay
            strokes={item.strokes}
            currentTimeSeconds={playbackTime}
            sourceWidth={item.captureWidth}
            sourceHeight={item.captureHeight}
            displayWidth={box.width}
            displayHeight={box.height}
          />
        </View>
      </View>
      <View style={styles.controlsRow}>
        <Pressable style={styles.controlButton} onPress={togglePlay}>
          <Text style={styles.controlButtonText}>{isPlaying ? 'Pause' : 'Play'}</Text>
        </Pressable>
        <Pressable style={styles.controlButton} onPress={restart}>
          <Text style={styles.controlButtonText}>Restart</Text>
        </Pressable>
      </View>
    </>
  );
}

export default function MarketplaceScreen() {
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'browse' | 'saved'>('browse');
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [bidding, setBidding] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<ListingItem | null>(null);
  const [bidInput, setBidInput] = useState('');
  const [tradeTarget, setTradeTarget] = useState<ListingItem | null>(null);
  const [myAutographs, setMyAutographs] = useState<MyAutograph[]>([]);
  const [submittingTrade, setSubmittingTrade] = useState(false);
  const [tradeOffers, setTradeOffers] = useState<TradeOffer[]>([]);
  const [viewOffersItem, setViewOffersItem] = useState<ListingItem | null>(null);
  const [respondingOffer, setRespondingOffer] = useState<string | null>(null);
  const { user, profile } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const router = useRouter();

  const mapRow = (row: any): ListingItem => ({
    id: row.id,
    celebrityId: row.celebrity_id,
    ownerId: row.owner_id,
    certificateId: row.certificate_id,
    createdAt: row.created_at,
    priceCents: row.price_cents ?? null,
    listingType: row.listing_type ?? 'fixed',
    reservePriceCents: row.reserve_price_cents ?? null,
    auctionEndsAt: row.auction_ends_at ?? null,
    topBidCents: null,
    topBidderId: null,
    isForSale: row.is_for_sale ?? false,
    openToTrade: row.open_to_trade ?? false,
    videoUri: row.video_url,
    strokes: row.strokes_json ?? [],
    captureWidth: row.capture_width ?? 1,
    captureHeight: row.capture_height ?? 1,
    celebrity: row.celebrity,
  });

useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoading(true);

      const baseQuery = `
        id, celebrity_id, owner_id, certificate_id, created_at, price_cents,
        listing_type, reserve_price_cents, auction_ends_at, open_to_trade,
        video_url, strokes_json, capture_width, capture_height,
        celebrity:celebrity_id ( display_name, verified )
      `;

      const applyTopBids = (items: ListingItem[], bids: { autograph_id: string; amount_cents: number; bidder_id: string }[]) => {
        const topBidMap: Record<string, { amount_cents: number; bidder_id: string }> = {};
        for (const bid of bids) {
          if (!topBidMap[bid.autograph_id] || bid.amount_cents > topBidMap[bid.autograph_id].amount_cents) {
            topBidMap[bid.autograph_id] = { amount_cents: bid.amount_cents, bidder_id: bid.bidder_id };
          }
        }
        return items.map((item) => ({
          ...item,
          topBidCents: topBidMap[item.id]?.amount_cents ?? null,
          topBidderId: topBidMap[item.id]?.bidder_id ?? null,
        }));
      };

      Promise.all([
        supabase.from('autographs').select(baseQuery).or('is_for_sale.eq.true,open_to_trade.eq.true').neq('owner_id', user.id).order('created_at', { ascending: false }),
        supabase.from('watchlist').select('autograph_id').eq('user_id', user.id),
        supabase.from('bids').select('autograph_id').eq('bidder_id', user.id),
        supabase.from('autographs').select('id, created_at, celebrity:celebrity_id ( display_name )').eq('owner_id', user.id).order('created_at', { ascending: false }),
        supabase.from('trade_offers').select(`
          id, created_at, target_autograph_id,
          offered_autograph_id,
          offerer:offerer_id ( display_name ),
          offered_autograph:offered_autograph_id ( celebrity:celebrity_id ( display_name ) )
        `).eq('target_owner_id', user.id).eq('status', 'pending'),
      ]).then(async ([browseRes, watchRes, bidsRes, myAutographsRes, offersRes]) => {
        const browseItems = (browseRes.data ?? []).map(mapRow);
        // Merge watchlist + bid autograph IDs so all watched/bid-on items show in Watching tab
        const watchedFromList = (watchRes.data ?? []).map((w: any) => w.autograph_id);
        const watchedFromBids = (bidsRes.data ?? []).map((b: any) => b.autograph_id);
        setWatchedIds(new Set([...watchedFromList, ...watchedFromBids]));

        const allIds = browseItems
          .filter((i) => i.listingType === 'auction' && i.isForSale)
          .map((i) => i.id);

        if (allIds.length > 0) {
          const { data: bids } = await supabase
            .from('bids')
            .select('autograph_id, amount_cents, bidder_id')
            .in('autograph_id', allIds);

          setListings(applyTopBids(browseItems, bids ?? []));
        } else {
          setListings(browseItems);
        }
        setMyAutographs(
          (myAutographsRes.data ?? []).map((r: any) => ({
            id: r.id,
            celebrityName: r.celebrity?.display_name ?? '—',
            createdAt: r.created_at,
          }))
        );
        setTradeOffers(
          (offersRes.data ?? []).map((r: any) => ({
            id: r.id,
            createdAt: r.created_at,
            targetAutographId: r.target_autograph_id,
            offeredAutographId: r.offered_autograph_id,
            offererName: r.offerer?.display_name ?? '—',
            offeredAutographCelebrity: r.offered_autograph?.celebrity?.display_name ?? '—',
          }))
        );
        setLoading(false);
      });
    }, [user])
  );

  const closePreview = () => {
    setPreviewItem(null);
    ScreenOrientation.unlockAsync().catch(() => {});
  };

  const toggleWatch = async (item: ListingItem) => {
    if (!user) return;
    const isWatched = watchedIds.has(item.id);
    if (isWatched) {
      await supabase.from('watchlist').delete().eq('user_id', user.id).eq('autograph_id', item.id);
      setWatchedIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    } else {
      await supabase.from('watchlist').insert({ user_id: user.id, autograph_id: item.id });
      setWatchedIds((prev) => new Set(prev).add(item.id));
    }
  };

  const handleBid = async (item: ListingItem) => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to place a bid.');
      return;
    }
    const dollars = parseFloat(bidInput);
    if (isNaN(dollars) || dollars <= 0) {
      Alert.alert('Invalid bid', 'Please enter a valid bid amount.');
      return;
    }
    const bidCents = Math.round(dollars * 100);
    const minBid = item.topBidCents
      ? item.topBidCents + 100
      : (item.reservePriceCents ?? 100);
    if (bidCents < minBid) {
      Alert.alert('Bid too low', `Minimum bid is ${formatPrice(minBid)}.`);
      return;
    }

    setBidding(item.id);

    try {
      const responseJson = await callEdgeFunction<{
        client_secret?: string;
        payment_event_id?: string;
      }>('create-bid-payment-intent', {
        autograph_id: item.id,
        amount_cents: bidCents,
      });

      const { client_secret, payment_event_id } = responseJson;
      if (!client_secret || !payment_event_id) throw new Error('Could not start bid authorization.');

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'TapnSign',
        style: 'automatic',
      });
      if (initError) throw new Error(initError.message);

      await ScreenOrientation.unlockAsync().catch(() => {});
      const { error: paymentError } = await presentPaymentSheet();
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT).catch(() => {});

      if (paymentError) {
        if (paymentError.code !== 'Canceled') Alert.alert('Payment Failed', paymentError.message);
        return;
      }

      await callEdgeFunction('place-bid', {
        autograph_id: item.id,
        payment_event_id,
      });

      setPreviewItem((prev) => prev ? { ...prev, topBidCents: bidCents } : prev);
      setListings((prev) => prev.map((l) =>
        l.id === item.id ? { ...l, topBidCents: bidCents, topBidderId: user.id } : l
      ));
      setBidInput('');
      Alert.alert('Bid Placed!', `Your bid of ${formatPrice(bidCents)} has been authorized. Your card will only be charged if you win.`);
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'Something went wrong.');
    } finally {
      setBidding(null);
    }
  };

  const handleTradeOffer = async (offeredAutographId: string) => {
    if (!user || !tradeTarget) return;
    setSubmittingTrade(true);
    try {
      await callEdgeFunction('create-trade-offer', {
        offered_autograph_id: offeredAutographId,
        target_autograph_id: tradeTarget.id,
      });
      setTradeTarget(null);
      Alert.alert('Trade Offer Sent!', 'The owner will be notified and can accept or decline your offer.');
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'Could not send trade offer.');
    } finally {
      setSubmittingTrade(false);
    }
  };

  const handleAcceptTrade = async (offer: TradeOffer) => {
    if (!user) return;
    setRespondingOffer(offer.id);
    try {
      await callEdgeFunction('respond-trade-offer', {
        trade_offer_id: offer.id,
        action: 'accept',
      });
      setTradeOffers((prev) => prev.filter((o) => o.id !== offer.id));
      setViewOffersItem(null);
      Alert.alert('Trade Accepted!', `You now own ${offer.offeredAutographCelebrity}'s autograph.`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong.');
    }
    setRespondingOffer(null);
  };

  const handleDeclineTrade = async (offer: TradeOffer) => {
    setRespondingOffer(offer.id);
    try {
      await callEdgeFunction('respond-trade-offer', {
        trade_offer_id: offer.id,
        action: 'decline',
      });
      setTradeOffers((prev) => prev.filter((o) => o.id !== offer.id));
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'Could not decline trade offer.');
    }
    setRespondingOffer(null);
  };

  const handlePurchase = async (item: ListingItem) => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to purchase autographs.');
      return;
    }

    setPurchasing(item.id);

    try {
      const responseJson = await callEdgeFunction<{
        client_secret?: string;
        payment_event_id?: string;
      }>('create-payment-intent', {
        autograph_id: item.id,
      });

      const { client_secret, payment_event_id } = responseJson;
      if (!client_secret || !payment_event_id) throw new Error('Could not start purchase.');

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'TapnSign',
        style: 'automatic',
      });
      if (initError) throw new Error(initError.message);

      await ScreenOrientation.unlockAsync().catch(() => {});
      const { error: paymentError } = await presentPaymentSheet();
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT).catch(() => {});

      if (paymentError) {
        if (paymentError.code !== 'Canceled') Alert.alert('Payment Failed', paymentError.message);
        setPurchasing(null);
        return;
      }

      await callEdgeFunction('purchase-autograph', {
        autograph_id: item.id,
        payment_event_id,
      });

      closePreview();
      Alert.alert(
        'Purchase Complete!',
        `You now own this autograph by ${item.celebrity.display_name}.`,
        [{ text: 'View My Autographs', onPress: () => router.push('/autographs') }]
      );
      setListings((prev) => prev.filter((l) => l.id !== item.id));
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'Something went wrong.');
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BrandColors.primary} />
      </View>
    );
  }

  const watchedListings = listings.filter((l) => watchedIds.has(l.id));
  const activeListings = tab === 'browse' ? listings : watchedListings;

  const emptyText = tab === 'browse'
    ? 'No autographs for sale right now.'
    : 'You have no saved listings.';

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabButton, tab === 'browse' && styles.tabButtonActive]}
          onPress={() => setTab('browse')}
        >
          <Text style={[styles.tabButtonText, tab === 'browse' && styles.tabButtonTextActive]}>
            Browse
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, tab === 'saved' && styles.tabButtonActive]}
          onPress={() => setTab('saved')}
        >
          <Text style={[styles.tabButtonText, tab === 'saved' && styles.tabButtonTextActive]}>
            Saved
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={activeListings}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}

        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => { setBidInput(''); setPreviewItem(item); }}>
            <View style={styles.cardLeft}>
              <Text style={styles.celebrityName}>{item.celebrity.display_name}</Text>
              {item.celebrity.verified && (
                <Text style={styles.verifiedBadge}>Verified</Text>
              )}
              <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
              <Text style={styles.tapHint}>Tap to preview</Text>
            </View>
            <View style={styles.cardRight}>
              {item.listingType === 'fixed' ? (
                <>
                  <Text style={styles.price}>{formatPrice(item.priceCents)}</Text>
                  {item.openToTrade && <Text style={styles.tradeLabel}>Open to Trade</Text>}
                </>
              ) : item.openToTrade && !item.isForSale ? (
                <Text style={styles.tradeLabel}>Trade</Text>
              ) : (
                <>
                  <Text style={styles.auctionLabel}>Auction</Text>
                  <Text style={styles.price}>
                    {item.topBidCents ? formatPrice(item.topBidCents) : formatPrice(item.reservePriceCents)}
                  </Text>
                  {item.topBidderId === user?.id && (
                    <Text style={styles.yourBidLabel}>Your bid</Text>
                  )}
                  <Text style={styles.timeLeft}>{formatTimeLeft(item.auctionEndsAt)}</Text>
                </>
              )}
            </View>
          </Pressable>
        )}
      />

      <Modal
        visible={!!previewItem}
        animationType="none"
        transparent={false}
        onShow={() => {
          // Don't lock orientation for auction items — keyboard will crash if locked
          const isOwnAuction = previewItem?.listingType === 'auction' && previewItem?.ownerId !== user?.id;
          if (!isOwnAuction) {
            ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT).catch(() => {});
          }
        }}
        onRequestClose={closePreview}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalTopRow}>
            <Pressable style={styles.closeButton} onPress={closePreview}>
              <Text style={styles.buttonText}>Close</Text>
            </Pressable>
            {previewItem && previewItem.ownerId !== user?.id && (
              <Pressable
                style={[styles.watchButton, watchedIds.has(previewItem.id) && styles.watchButtonActive]}
                onPress={() => toggleWatch(previewItem)}
              >
                <Text style={[styles.buttonText, watchedIds.has(previewItem.id) && styles.watchButtonTextActive]}>
                  {watchedIds.has(previewItem.id) ? 'Saved' : 'Save'}
                </Text>
              </Pressable>
            )}
            {previewItem && (
              <View style={styles.modalMeta}>
                <Text style={styles.modalCelebrity}>{previewItem.celebrity.display_name}</Text>
                {previewItem.listingType === 'fixed' ? (
                  <Text style={styles.modalPrice}>{formatPrice(previewItem.priceCents)}</Text>
                ) : (
                  <Text style={styles.modalPrice}>
                    {previewItem.topBidCents ? `Top bid: ${formatPrice(previewItem.topBidCents)}` : `Reserve: ${formatPrice(previewItem.reservePriceCents)}`}
                    {' · '}{formatTimeLeft(previewItem.auctionEndsAt)}
                  </Text>
                )}
                {previewItem.listingType === 'auction' && previewItem.topBidderId === user?.id && (
                  <Text style={styles.yourBidLabel}>You're winning</Text>
                )}
              </View>
            )}
            {previewItem && previewItem.listingType === 'fixed' && previewItem.ownerId !== user?.id && (
              <Pressable
                style={[styles.buyButtonLarge, purchasing === previewItem.id && styles.buyButtonDisabled]}
                onPress={() => handlePurchase(previewItem)}
                disabled={purchasing === previewItem.id}
              >
                {purchasing === previewItem.id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.buttonText}>Buy</Text>
                }
              </Pressable>
            )}
            {previewItem && previewItem.openToTrade && previewItem.ownerId !== user?.id && profile?.role === 'verified' && (
              <Pressable
                style={styles.tradeButton}
                onPress={() => setTradeTarget(previewItem)}
              >
                <Text style={styles.buttonText}>Trade</Text>
              </Pressable>
            )}
            {previewItem && previewItem.openToTrade && previewItem.ownerId !== user?.id && profile?.role !== 'verified' && (
              <Pressable
                style={[styles.tradeButton, { opacity: 0.5 }]}
                onPress={() => Alert.alert('Verified Members Only', 'Get verified to make trade offers.')}
              >
                <Text style={styles.buttonText}>Trade</Text>
              </Pressable>
            )}
          </View>

          {previewItem?.listingType === 'auction' && previewItem.ownerId !== user?.id && (
            <View style={styles.bidRowTop}>
              <TextInput
                style={styles.bidInputTop}
                placeholder={`Min: ${formatPrice(previewItem.topBidCents ? previewItem.topBidCents + 100 : previewItem.reservePriceCents)}`}
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
                returnKeyType="done"
                value={bidInput}
                onChangeText={setBidInput}
                editable={bidding !== previewItem.id}
              />
              <Pressable
                style={[styles.bidButtonTop, bidding === previewItem.id && styles.buyButtonDisabled]}
                onPress={() => handleBid(previewItem)}
                disabled={bidding === previewItem.id}
              >
                {bidding === previewItem.id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.buttonText}>Bid</Text>
                }
              </Pressable>
            </View>
          )}

          {previewItem && <PreviewPlayer item={previewItem} />}

          {/* Trade offer sheet */}
          {tradeTarget && (
            <View style={styles.tradeOverlay}>
              <View style={styles.tradeSheet}>
                <Text style={styles.tradeSheetTitle}>Make a Trade Offer</Text>
                <Text style={styles.tradeSheetSubtitle}>
                  Pick one of your autographs to offer in exchange for{' '}
                  {tradeTarget.celebrity.display_name}'s autograph.
                </Text>
                {myAutographs.length === 0 ? (
                  <Text style={styles.tradeEmptyText}>You don't own any autographs to trade.</Text>
                ) : (
                  myAutographs.map((a) => (
                    <Pressable
                      key={a.id}
                      style={[styles.tradeAutographRow, submittingTrade && { opacity: 0.5 }]}
                      onPress={() => handleTradeOffer(a.id)}
                      disabled={submittingTrade}
                    >
                      <Text style={styles.tradeAutographName}>{a.celebrityName}</Text>
                      <Text style={styles.tradeAutographDate}>{formatDate(a.createdAt)}</Text>
                    </Pressable>
                  ))
                )}
                <Pressable onPress={() => setTradeTarget(null)} style={{ marginTop: 16 }}>
                  <Text style={styles.tradeCancelText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Incoming trade offers sheet */}
      <Modal
        visible={!!viewOffersItem}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setViewOffersItem(null)}
      >
        <View style={styles.tradeOverlay}>
          <View style={styles.tradeSheet}>
            <Text style={styles.tradeSheetTitle}>Trade Offers</Text>
            <Text style={styles.tradeSheetSubtitle}>
              {viewOffersItem?.celebrity.display_name} autograph
            </Text>
            {tradeOffers.filter((o) => o.targetAutographId === viewOffersItem?.id).map((offer) => (
              <View key={offer.id} style={styles.offerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerFromText}>{offer.offererName} offers:</Text>
                  <Text style={styles.offerAutographText}>{offer.offeredAutographCelebrity} autograph</Text>
                </View>
                <View style={styles.offerActions}>
                  <Pressable
                    style={[styles.acceptButton, respondingOffer === offer.id && { opacity: 0.5 }]}
                    onPress={() => handleAcceptTrade(offer)}
                    disabled={!!respondingOffer}
                  >
                    <Text style={styles.buttonText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.declineButton, respondingOffer === offer.id && { opacity: 0.5 }]}
                    onPress={() => handleDeclineTrade(offer)}
                    disabled={!!respondingOffer}
                  >
                    <Text style={styles.declineButtonText}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable onPress={() => setViewOffersItem(null)} style={{ marginTop: 16 }}>
              <Text style={styles.tradeCancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.background,
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BrandColors.background,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
  },
  separator: {
    height: 1,
    backgroundColor: '#ccc',
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  cardLeft: {
    flex: 1,
  },
  celebrityName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  verifiedBadge: {
    fontSize: 11,
    color: '#fff',
    backgroundColor: '#111',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
    overflow: 'hidden',
  },
  cardDate: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  auctionLabel: {
    fontSize: 11,
    color: '#111',
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeLeft: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  watchButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  watchButtonActive: {
    backgroundColor: '#fff',
  },
  watchButtonTextActive: {
    color: '#111',
  },
  yourBidLabel: {
    fontSize: 11,
    color: '#fff',
    backgroundColor: '#2e7d32',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-end',
    marginTop: 2,
    overflow: 'hidden',
    fontFamily: BrandFonts.primary,
  },
  bidRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'black',
  },
  bidInput: {
    flex: 1,
    backgroundColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#fff',
  },
  bidButton: {
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
  },
  bidRowTop: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'black',
  },
  bidInputTop: {
    width: 110,
    backgroundColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: '#fff',
  },
  bidButtonTop: {
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    justifyContent: 'center',
  },
  tapHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
    fontStyle: 'italic',
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'black',
    paddingTop: 50,
  },
  modalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  modalMeta: {
    flex: 1,
    alignItems: 'center',
  },
  modalCelebrity: {
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalPrice: {
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontSize: 14,
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#111',
    borderRadius: 8,
  },
  buyButtonLarge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#111',
    borderRadius: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  buyButtonDisabled: {
    opacity: 0.6,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  offerFromText: {
    fontSize: 13,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  offerAutographText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  offerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  declineButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  declineButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  offersButton: {
    backgroundColor: '#1565C0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  offersButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  tradeLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1565C0',
    fontFamily: BrandFonts.primary,
  },
  tradeButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#1565C0',
    borderRadius: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  tradeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  tradeSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 28,
    maxHeight: '70%',
  },
  tradeSheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    marginBottom: 8,
  },
  tradeSheetSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  tradeEmptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginVertical: 16,
  },
  tradeAutographRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tradeAutographName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  tradeAutographDate: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  tradeCancelText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 15,
    fontFamily: BrandFonts.primary,
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#111',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#111',
  },
  tabButtonText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
    color: '#111',
  },
  tabButtonTextActive: {
    color: '#fff',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
    fontSize: 15,
  },
  videoWrapper: {
    flex: 1,
    width: '100%',
    backgroundColor: 'black',
  },
  videoLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'black',
  },
  controlButton: {
    backgroundColor: '#111',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  controlButtonText: {
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
  },
});

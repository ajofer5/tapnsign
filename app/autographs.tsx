import { BrandColors, BrandFonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path } from 'react-native-svg';

type TradeOffer = {
  id: string;
  offererName: string;
  offeredAutographId: string;
  offeredAutographCelebrity: string;
  targetAutographId: string;
};

type Point = {
  x: number;
  y: number;
  t: number;
};

type Stroke = {
  id: string;
  points: Point[];
};

type AutographItem = {
  id: string;
  certificateId: string;
  createdAt: string;
  videoUri: string;
  strokes: Stroke[];
  captureWidth?: number;
  captureHeight?: number;
  isForSale: boolean;
  priceCents: number | null;
  listingType: 'fixed' | 'auction';
  auctionEndsAt: string | null;
  reservePriceCents: number | null;
  topBidCents: number | null;
  openToTrade: boolean;
  celebrityName: string | null;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function AnimatedSignatureOverlay({
  strokes,
  currentTimeSeconds,
  sourceWidth,
  sourceHeight,
  displayWidth,
  displayHeight,
}: {
  strokes: Stroke[];
  currentTimeSeconds: number;
  sourceWidth: number;
  sourceHeight: number;
  displayWidth: number;
  displayHeight: number;
}) {
  const safeSourceWidth = sourceWidth || 1;
  const safeSourceHeight = sourceHeight || 1;

  const scaleX = displayWidth / safeSourceWidth;
  const scaleY = displayHeight / safeSourceHeight;

  const buildPartialPath = (points: Point[]) => {
    const visiblePoints = points.filter((point) => point.t <= currentTimeSeconds);
    if (!visiblePoints.length) return '';

    return visiblePoints
      .map((point, index) => {
        const x = point.x * scaleX;
        const y = point.y * scaleY;
        return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
      })
      .join(' ');
  };

  return (
    <Svg width={displayWidth} height={displayHeight} style={styles.overlaySvg}>
      {strokes.map((stroke) => {
        const d = buildPartialPath(stroke.points);
        if (!d) return null;

        return (
          <Path
            key={stroke.id}
            d={d}
            stroke="red"
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </Svg>
  );
}

function VideoWithOverlay({
  item,
  playbackTime,
  setPlaybackTime,
  onCertificate,
}: {
  item: AutographItem;
  playbackTime: number;
  setPlaybackTime: (value: number) => void;
  onCertificate?: () => void;
}) {
  const [box, setBox] = useState({ width: 1, height: 1 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [rotation, setRotation] = useState(0);
  const videoRef = useRef<Video | null>(null);

  const captureWidth = item.captureWidth || 1;
  const captureHeight = item.captureHeight || 1;
  const isRotated = rotation === 90 || rotation === -90;

  const handleStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPlaybackTime(status.positionMillis / 1000);
    setIsPlaying(status.isPlaying);
  };

  const togglePlayPause = async () => {
    if (!videoRef.current) return;
    const status = await videoRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  return (
    <>
      <View
        style={styles.videoWrapper}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setBox({ width, height });
        }}
      >
        <View style={styles.videoLayer}>
          <Video
            ref={videoRef}
            source={{ uri: item.videoUri }}
            style={[
              styles.video,
              isRotated && {
                width: box.height,
                height: box.width,
              },
              rotation !== 0 && {
                transform: [{ rotate: `${rotation}deg` }],
              },
            ]}
            useNativeControls={false}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
            onReadyForDisplay={({ naturalSize }) => {
              setRotation(naturalSize.height > naturalSize.width ? 90 : 0);
            }}
            onPlaybackStatusUpdate={handleStatusUpdate}
          />
        </View>

        <View pointerEvents="none" style={styles.overlayContainer}>
          <AnimatedSignatureOverlay
            strokes={item.strokes ?? []}
            currentTimeSeconds={playbackTime}
            sourceWidth={captureWidth}
            sourceHeight={captureHeight}
            displayWidth={box.width}
            displayHeight={box.height}
          />
        </View>
      </View>

      <View style={styles.controlsRow}>
        <Pressable style={styles.controlButton} onPress={togglePlayPause}>
          <Text style={styles.controlButtonText}>{isPlaying ? 'Pause' : 'Play'}</Text>
        </Pressable>
        {onCertificate && (
          <Pressable style={[styles.controlButton, { marginLeft: 'auto' }]} onPress={onCertificate}>
            <Text style={styles.controlButtonText}>Certificate</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

export default function AutographsScreen() {
  const [data, setData] = useState<AutographItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<AutographItem | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [certItem, setCertItem] = useState<AutographItem | null>(null);
  const [shareItem, setShareItem] = useState<AutographItem | null>(null);
  const [sellItem, setSellItem] = useState<AutographItem | null>(null);
  const [listingType, setListingType] = useState<'fixed' | 'auction'>('fixed');
  const [openToTradeToo, setOpenToTradeToo] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [reserveInput, setReserveInput] = useState('');
  const [durationDays, setDurationDays] = useState<1 | 3 | 7>(3);
  const [saving, setSaving] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [tradeOffers, setTradeOffers] = useState<TradeOffer[]>([]);
  const [viewOffersItem, setViewOffersItem] = useState<AutographItem | null>(null);
  const [respondingOffer, setRespondingOffer] = useState<string | null>(null);
  const { user } = useAuth();

  const handleListForSale = async () => {
    if (!sellItem) return;

    if (listingType === 'fixed') {
      const dollars = parseFloat(priceInput);
      if (isNaN(dollars) || dollars <= 0) {
        Alert.alert('Invalid price', 'Please enter a valid price greater than $0.');
        return;
      }
      setSaving(true);
      await supabase.from('trade_offers').delete().eq('target_autograph_id', sellItem.id).eq('status', 'pending');
      const { error } = await supabase
        .from('autographs')
        .update({
          is_for_sale: true,
          listing_type: 'fixed',
          price_cents: Math.round(dollars * 100),
          reserve_price_cents: null,
          auction_ends_at: null,
          open_to_trade: openToTradeToo,
        })
        .eq('id', sellItem.id);
      setSaving(false);
      if (error) { Alert.alert('Error', error.message); return; }
      setData((prev) => prev.map((i) =>
        i.id === sellItem.id
          ? { ...i, isForSale: true, priceCents: Math.round(dollars * 100), listingType: 'fixed', openToTrade: openToTradeToo }
          : i
      ));
      setSellItem(null);
      setPriceInput('');
      setOpenToTradeToo(false);
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT).catch(() => {});
      Alert.alert('Listed!', `Your autograph is listed for $${dollars.toFixed(2)}${openToTradeToo ? ' and open to trades' : ''}.`);
    } else {
      const reserve = parseFloat(reserveInput);
      if (isNaN(reserve) || reserve <= 0) {
        Alert.alert('Invalid reserve', 'Please enter a valid reserve price greater than $0.');
        return;
      }
      const endsAt = new Date();
      endsAt.setDate(endsAt.getDate() + durationDays);
      setSaving(true);
      // Clear any old bids so the auction starts fresh
      await supabase.from('bids').delete().eq('autograph_id', sellItem.id);
      const { error } = await supabase
        .from('autographs')
        .update({
          is_for_sale: true,
          listing_type: 'auction',
          reserve_price_cents: Math.round(reserve * 100),
          auction_ends_at: endsAt.toISOString(),
          price_cents: null,
        })
        .eq('id', sellItem.id);
      setSaving(false);
      if (error) { Alert.alert('Error', error.message); return; }
      setData((prev) => prev.map((i) =>
        i.id === sellItem.id
          ? { ...i, isForSale: true, listingType: 'auction', reservePriceCents: Math.round(reserve * 100), auctionEndsAt: endsAt.toISOString(), topBidCents: null }
          : i
      ));
      setSellItem(null);
      setReserveInput('');
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT).catch(() => {});
      Alert.alert('Auction Started!', `Your autograph is up for auction for ${durationDays} day${durationDays > 1 ? 's' : ''} with a $${reserve.toFixed(2)} reserve.`);
    }
  };

  const handleRemoveFromTrade = (item: AutographItem) => {
    Alert.alert(
      'Remove Trade Listing',
      'Are you sure you want to stop accepting trade offers for this autograph?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('trade_offers').delete().eq('target_autograph_id', item.id).eq('status', 'pending');
            const { error } = await supabase
              .from('autographs')
              .update({ open_to_trade: false })
              .eq('id', item.id);
            if (error) { Alert.alert('Error', error.message); return; }
            setData((prev) => prev.map((i) =>
              i.id === item.id ? { ...i, openToTrade: false } : i
            ));
          },
        },
      ]
    );
  };

  const handleAcceptTrade = async (offer: TradeOffer) => {
    setRespondingOffer(offer.id);
    try {
      const { data: offerRow } = await supabase.from('trade_offers').select('offerer_id').eq('id', offer.id).single();
      const offererId = offerRow?.offerer_id;
      if (!offererId) throw new Error('Could not find offerer.');
      await Promise.all([
        supabase.from('autographs').update({ owner_id: user!.id, is_for_sale: false, open_to_trade: false }).eq('id', offer.offeredAutographId),
        supabase.from('autographs').update({ owner_id: offererId, is_for_sale: false, open_to_trade: false }).eq('id', offer.targetAutographId),
      ]);
      await supabase.from('trade_offers').update({ status: 'accepted' }).eq('id', offer.id);
      await supabase.from('trade_offers').update({ status: 'declined' })
        .in('target_autograph_id', [offer.targetAutographId, offer.offeredAutographId])
        .eq('status', 'pending').neq('id', offer.id);
      setTradeOffers((prev) => prev.filter((o) => o.id !== offer.id));
      setData((prev) => prev.filter((i) => i.id !== offer.targetAutographId));
      setViewOffersItem(null);
      Alert.alert('Trade Accepted!', `You now own ${offer.offeredAutographCelebrity}'s autograph.`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong.');
    }
    setRespondingOffer(null);
  };

  const handleDeclineTrade = async (offer: TradeOffer) => {
    setRespondingOffer(offer.id);
    await supabase.from('trade_offers').update({ status: 'declined' }).eq('id', offer.id);
    setTradeOffers((prev) => prev.filter((o) => o.id !== offer.id));
    setRespondingOffer(null);
  };

  const handleRemoveFromSale = (item: AutographItem) => {
    if (item.listingType === 'auction' && item.topBidCents) {
      Alert.alert(
        'Cannot Unlist',
        'This auction already has a bid. You cannot remove it once bidding has started.'
      );
      return;
    }

    Alert.alert(
      'Unlist Autograph',
      'Are you sure you want to remove this from the marketplace?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlist',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('trade_offers').delete().eq('target_autograph_id', item.id).eq('status', 'pending');
            const { error } = await supabase
              .from('autographs')
              .update({ is_for_sale: false, open_to_trade: false, price_cents: null, reserve_price_cents: null, auction_ends_at: null })
              .eq('id', item.id);
            if (error) { Alert.alert('Error', error.message); return; }
            setData((prev) => prev.map((i) =>
              i.id === item.id ? { ...i, isForSale: false, openToTrade: false, priceCents: null, reservePriceCents: null, auctionEndsAt: null } : i
            ));
          },
        },
      ]
    );
  };

  const appUrl = process.env.EXPO_PUBLIC_APP_URL ?? 'https://tapnsign.app';

  const openVideo = (item: AutographItem) => {
    setPlaybackTime(0);
    setSelectedItem(item);
  };

  const closeModal = () => {
    setSelectedItem(null);
    setPlaybackTime(0);
    ScreenOrientation.unlockAsync().catch(() => {});
  };

  const handleModalShow = () => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT).catch(() => {});
  };

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      supabase
        .from('autographs')
        .select('*, celebrity:celebrity_id ( display_name )')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .then(async ({ data: rows, error }) => {
          if (error) { console.log('Load autographs error:', error); setData([]); return; }
          const items: AutographItem[] = (rows ?? []).map((row: any) => ({
            id: row.id,
            certificateId: row.certificate_id,
            createdAt: row.created_at,
            videoUri: row.video_url,
            strokes: row.strokes_json ?? [],
            captureWidth: row.capture_width,
            captureHeight: row.capture_height,
            isForSale: row.is_for_sale ?? false,
            priceCents: row.price_cents ?? null,
            listingType: row.listing_type ?? 'fixed',
            auctionEndsAt: row.auction_ends_at ?? null,
            reservePriceCents: row.reserve_price_cents ?? null,
            topBidCents: null,
            openToTrade: row.open_to_trade ?? false,
            celebrityName: (row.celebrity as any)?.display_name ?? null,
          }));

          const auctionIds = items.filter((i) => i.listingType === 'auction' && i.isForSale).map((i) => i.id);
          if (auctionIds.length > 0) {
            const { data: bids } = await supabase
              .from('bids')
              .select('autograph_id, amount_cents')
              .in('autograph_id', auctionIds);
            const topBidMap: Record<string, number> = {};
            for (const bid of bids ?? []) {
              if (!topBidMap[bid.autograph_id] || bid.amount_cents > topBidMap[bid.autograph_id]) {
                topBidMap[bid.autograph_id] = bid.amount_cents;
              }
            }
            setData(items.map((i) => ({ ...i, topBidCents: topBidMap[i.id] ?? null })));
          } else {
            setData(items);
          }

          // Generate thumbnails in parallel (non-blocking)
          const thumbEntries = await Promise.all(
            items.map(async (item) => {
              try {
                const { uri } = await VideoThumbnails.getThumbnailAsync(item.videoUri, { time: 0 });
                return [item.id, uri] as [string, string];
              } catch {
                return null;
              }
            })
          );
          const thumbMap: Record<string, string> = {};
          for (const entry of thumbEntries) {
            if (entry) thumbMap[entry[0]] = entry[1];
          }
          setThumbnails(thumbMap);

          // Load pending trade offers for this user's autographs
          supabase.from('trade_offers').select(`
            id, target_autograph_id, offered_autograph_id,
            offerer:offerer_id ( display_name ),
            offered_autograph:offered_autograph_id ( celebrity:celebrity_id ( display_name ) )
          `).eq('target_owner_id', user.id).eq('status', 'pending')
            .then(({ data: offers }) => {
              setTradeOffers(
                (offers ?? []).map((r: any) => ({
                  id: r.id,
                  targetAutographId: r.target_autograph_id,
                  offeredAutographId: r.offered_autograph_id,
                  offererName: r.offerer?.display_name ?? '—',
                  offeredAutographCelebrity: r.offered_autograph?.celebrity?.display_name ?? '—',
                }))
              );
            });
        });
    }, [user])
  );

  const emptyComponent = useMemo(
    () => <Text style={styles.emptyText}>No autograph captures saved yet.</Text>,
    []
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={emptyComponent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => openVideo(item)}>
            {thumbnails[item.id] ? (
              <Image source={{ uri: thumbnails[item.id] }} style={[styles.thumbnail, { transform: [{ rotate: '90deg' }] }]} />
            ) : (
              <View style={styles.thumbnail}>
                <Text style={styles.thumbnailText}>Video</Text>
              </View>
            )}
            <View style={styles.textContainer}>
              <Text style={styles.dateText}>
                {item.celebrityName ? `${item.celebrityName} · ` : ''}{formatDateTime(item.createdAt)}
              </Text>
              {item.isForSale && (
                <Text style={styles.listedBadge}>
                  {item.listingType === 'auction'
                    ? item.topBidCents
                      ? `Auction · $${(item.topBidCents / 100).toFixed(2)} top bid`
                      : `Auction · $${((item.reservePriceCents ?? 0) / 100).toFixed(2)} reserve`
                    : `Listed · $${((item.priceCents ?? 0) / 100).toFixed(2)}`}
                </Text>
              )}
              {item.openToTrade && !item.isForSale && (
                <Text style={styles.tradeBadge}>Open to Trade</Text>
              )}
              {tradeOffers.filter((o) => o.targetAutographId === item.id).length > 0 && (
                <Pressable
                  style={styles.offersButton}
                  onPress={() => setViewOffersItem(item)}
                >
                  <Text style={styles.offersButtonText}>
                    {tradeOffers.filter((o) => o.targetAutographId === item.id).length} Trade Offer{tradeOffers.filter((o) => o.targetAutographId === item.id).length > 1 ? 's' : ''}
                  </Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        )}
      />

      {/* Video playback modal */}
      <Modal
        visible={!!selectedItem}
        animationType="none"
        transparent={false}
        onShow={handleModalShow}
        onRequestClose={() => closeModal()}
      >
        <View style={styles.videoModalContainer}>
          <View style={styles.modalTopRow}>
            <Pressable style={styles.closeButton} onPress={closeModal}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
            <View style={styles.modalTopRight}>
              {selectedItem && selectedItem.isForSale && (
                <Pressable
                  style={styles.sellButton}
                  onPress={() => setShareItem(selectedItem)}
                >
                  <Text style={styles.closeButtonText}>Share</Text>
                </Pressable>
              )}
              {selectedItem && (
                selectedItem.isForSale
                  ? <Pressable
                      style={styles.sellButton}
                      onPress={() => handleRemoveFromSale(selectedItem)}
                    >
                      <Text style={styles.closeButtonText}>Unlist</Text>
                    </Pressable>
                  : selectedItem.openToTrade
                  ? <Pressable
                      style={styles.sellButton}
                      onPress={() => handleRemoveFromTrade(selectedItem)}
                    >
                      <Text style={styles.closeButtonText}>Remove Trade</Text>
                    </Pressable>
                  : <Pressable
                      style={styles.sellButton}
                      onPress={() => {
                        setPriceInput('');
                        setListingType('fixed');
                        setSellItem(selectedItem);
                        ScreenOrientation.unlockAsync().catch(() => {});
                      }}
                    >
                      <Text style={styles.closeButtonText}>Sell</Text>
                    </Pressable>
              )}
            </View>
          </View>

          {selectedItem && (
            <>
              <VideoWithOverlay
                item={selectedItem}
                playbackTime={playbackTime}
                setPlaybackTime={setPlaybackTime}
                onCertificate={() => setCertItem(selectedItem)}
              />
              <Text style={styles.modalDateText}>
                {formatDateTime(selectedItem.createdAt)}
              </Text>
            </>
          )}

          {/* Sell sheet overlaid inside the video modal */}
          {sellItem && (
            <View style={styles.sellOverlay}>
              <View style={styles.certSheet}>
                <Text style={styles.certTitle}>List for Sale</Text>
                <Text style={styles.certDate}>{formatDateTime(sellItem.createdAt)}</Text>

                {/* Listing type toggle */}
                <View style={styles.sellTypeRow}>
                  <Pressable
                    style={[styles.sellTypeButton, listingType === 'fixed' && styles.sellTypeButtonActive]}
                    onPress={() => setListingType('fixed')}
                  >
                    <Text style={[styles.sellTypeText, listingType === 'fixed' && styles.sellTypeTextActive]}>
                      Fixed Price
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.sellTypeButton, listingType === 'auction' && styles.sellTypeButtonActive]}
                    onPress={() => setListingType('auction')}
                  >
                    <Text style={[styles.sellTypeText, listingType === 'auction' && styles.sellTypeTextActive]}>
                      Auction
                    </Text>
                  </Pressable>
                </View>

                {listingType === 'fixed' ? (
                  <>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="Price in USD (e.g. 49.99)"
                      placeholderTextColor="#999"
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      onSubmitEditing={() => {}}
                      value={priceInput}
                      onChangeText={setPriceInput}
                    />
                    <Pressable
                      style={styles.checkboxRow}
                      onPress={() => setOpenToTradeToo((v) => !v)}
                    >
                      <View style={[styles.checkbox, openToTradeToo && styles.checkboxChecked]}>
                        {openToTradeToo && <Text style={styles.checkboxTick}>✓</Text>}
                      </View>
                      <Text style={styles.checkboxLabel}>Also open to trades</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="Reserve price in USD (e.g. 25.00)"
                      placeholderTextColor="#999"
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      onSubmitEditing={() => {}}
                      value={reserveInput}
                      onChangeText={setReserveInput}
                    />
                    <Text style={styles.certIdLabel}>Auction Duration</Text>
                    <View style={styles.durationRow}>
                      {([1, 3, 7] as const).map((d) => (
                        <Pressable
                          key={d}
                          style={[styles.durationButton, durationDays === d && styles.durationButtonActive]}
                          onPress={() => setDurationDays(d)}
                        >
                          <Text style={[styles.durationText, durationDays === d && styles.durationTextActive]}>
                            {d}d
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}

                <Pressable
                  style={[styles.certCloseButton, saving && { opacity: 0.6 }]}
                  onPress={handleListForSale}
                  disabled={saving}
                >
                  <Text style={styles.closeButtonText}>
                    {saving ? 'Saving…' : 'Confirm Listing'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setSellItem(null);
                    setOpenToTradeToo(false);
                    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT).catch(() => {});
                  }}
                  style={{ marginTop: 12 }}
                >
                  <Text style={styles.certDate}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Certificate sheet overlaid inside the video modal */}
          {certItem && (
            <View style={styles.certOverlay}>
              <ScrollView style={{ width: '100%' }} contentContainerStyle={styles.certSheet}>
                <Text style={styles.certTitle}>Certificate of Authenticity</Text>

                <View style={styles.certRow}>
                  <Text style={styles.certIdLabel}>Signed By</Text>
                  <Text style={styles.certRowValue}>{certItem.celebrityName ?? '—'}</Text>
                </View>
                <View style={styles.certRow}>
                  <Text style={styles.certIdLabel}>Date Captured</Text>
                  <Text style={styles.certRowValue}>{formatDateTime(certItem.createdAt)}</Text>
                </View>
                <View style={styles.certRow}>
                  <Text style={styles.certIdLabel}>Certificate ID</Text>
                  <Text style={styles.certIdValue}>{certItem.certificateId}</Text>
                </View>

                <Pressable style={[styles.certCloseButton, { marginTop: 20 }]} onPress={() => setCertItem(null)}>
                  <Text style={styles.closeButtonText}>Done</Text>
                </Pressable>
              </ScrollView>
            </View>
          )}

          {/* Share overlay — shown when listing is for sale */}
          {shareItem && (
            <View style={styles.certOverlay}>
              <ScrollView style={{ width: '100%' }} contentContainerStyle={styles.certSheet}>
                <Text style={styles.certTitle}>Share Listing</Text>
                <Text style={styles.certDate}>{shareItem.celebrityName ?? 'Autograph'}</Text>

                <View style={styles.qrContainer}>
                  <QRCode
                    value={`${appUrl}/verify/${shareItem.certificateId}`}
                    size={180}
                    color={BrandColors.primary}
                    backgroundColor="#fff"
                  />
                </View>

                <Text style={styles.certHint}>
                  Scan or share this code to view the listing
                </Text>

                <Pressable
                  style={styles.certCloseButton}
                  onPress={() => Share.share({ message: `${appUrl}/verify/${shareItem.certificateId}` })}
                >
                  <Text style={styles.closeButtonText}>Share Link</Text>
                </Pressable>

                <Pressable onPress={() => setShareItem(null)} style={{ marginTop: 12 }}>
                  <Text style={styles.certDate}>Done</Text>
                </Pressable>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* Trade offers modal */}
      <Modal
        visible={!!viewOffersItem}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setViewOffersItem(null)}
      >
        <View style={styles.certOverlay}>
          <View style={styles.certSheet}>
            <Text style={styles.certTitle}>Trade Offers</Text>
            <Text style={styles.certDate}>{viewOffersItem?.celebrityName ?? 'Autograph'}</Text>
            {tradeOffers.filter((o) => o.targetAutographId === viewOffersItem?.id).map((offer) => (
              <View key={offer.id} style={styles.offerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerFromText}>{offer.offererName} offers:</Text>
                  <Text style={styles.offerAutographText}>{offer.offeredAutographCelebrity} autograph</Text>
                </View>
                <View style={styles.offerActions}>
                  <Pressable
                    style={[styles.acceptButton, !!respondingOffer && { opacity: 0.5 }]}
                    onPress={() => handleAcceptTrade(offer)}
                    disabled={!!respondingOffer}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600', fontFamily: BrandFonts.primary }}>Accept</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.declineButton, !!respondingOffer && { opacity: 0.5 }]}
                    onPress={() => handleDeclineTrade(offer)}
                    disabled={!!respondingOffer}
                  >
                    <Text style={{ color: '#666', fontWeight: '600', fontFamily: BrandFonts.primary }}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable onPress={() => setViewOffersItem(null)} style={{ marginTop: 16 }}>
              <Text style={styles.certDate}>Close</Text>
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
    padding: 16,
    backgroundColor: BrandColors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#d9d9d9',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  thumbnailText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  textContainer: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  listedBadge: {
    fontSize: 12,
    color: '#fff',
    backgroundColor: '#111',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
    overflow: 'hidden',
    fontFamily: BrandFonts.primary,
  },
  separator: {
    height: 1,
    backgroundColor: '#ccc',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
  },
  videoModalContainer: {
    flex: 1,
    backgroundColor: 'black',
    paddingTop: 50,
  },
  modalTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  certButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  sellButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  modalTopRight: {
    flexDirection: 'row',
    gap: 8,
  },
  closeButtonText: {
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
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
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  overlaySvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'black',
  },
  controlButton: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  controlButtonText: {
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
  },
  modalDateText: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    fontSize: 14,
    color: '#fff',
    fontFamily: BrandFonts.primary,
    backgroundColor: 'black',
  },
  certOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    paddingTop: 80,
  },
  sellOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    paddingTop: 50,
  },
  certSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  certTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    marginBottom: 4,
  },
  certDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 16,
  },
  certHint: {
    fontSize: 13,
    color: '#999',
    marginBottom: 20,
    textAlign: 'center',
  },
  certRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    width: '100%',
  },
  certRowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    fontFamily: BrandFonts.primary,
    maxWidth: '60%',
    textAlign: 'right',
  },
  certIdLabel: {
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  certIdValue: {
    fontSize: 11,
    color: '#333',
    fontFamily: 'monospace',
    marginBottom: 24,
    textAlign: 'center',
  },
  certCloseButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    width: '100%',
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
  offersButton: {
    backgroundColor: '#1565C0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  offersButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  tradeBadge: {
    fontSize: 12,
    color: '#fff',
    backgroundColor: '#1565C0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
    overflow: 'hidden',
    fontFamily: BrandFonts.primary,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: BrandColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#fff',
  },
  checkboxTick: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  tradeHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  priceInput: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    marginBottom: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  sellTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    width: '100%',
  },
  sellTypeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BrandColors.primary,
    alignItems: 'center',
  },
  sellTypeButtonActive: {
    backgroundColor: '#fff',
  },
  sellTypeText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
    color: '#111',
  },
  sellTypeTextActive: {
    color: '#fff',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    width: '100%',
  },
  durationButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BrandColors.primary,
    alignItems: 'center',
  },
  durationButtonActive: {
    backgroundColor: '#fff',
  },
  durationText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
    color: '#111',
  },
  durationTextActive: {
    color: '#fff',
  },
});

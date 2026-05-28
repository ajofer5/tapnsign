import { AutographPlayer } from '@/components/autograph-player';
import { CardMetadataBlock } from '@/components/card-metadata-block';
import { CertificateSheet } from '@/components/certificate-sheet';
import { NameWithSequence, formatPublicVideoDate, formatPublicVideoPrice } from '@/components/public-video-card';
import { PublicVideoThumbnail } from '@/components/public-video-thumbnail';
import { BrandColors, BrandFonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { callEdgeFunction } from '@/lib/api';
import { logInterestEvent } from '@/lib/interest';
import { buildAutographUrl } from '@/lib/public-links';
import { supabase } from '@/lib/supabase';
import { openAuthenticatedWebPath } from '@/lib/web-handoff';
import { useStripe } from '@stripe/stripe-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Point = { x: number; y: number; t: number };
type Stroke = { id: string; points: Point[] };

type ListingItem = {
  id: string;
  certificateId: string;
  createdAt: string;
  visibility: 'private' | 'public';
  saleState: 'not_for_sale' | 'fixed';
  listingMode: 'buy_now' | 'make_offer';
  priceCents: number | null;
  videoUri: string | null;
  previewFrameUrls: string[];
  previewFrameTimesMs: number[];
  strokes: Stroke[];
  captureWidth: number;
  captureHeight: number;
  creatorId: string;
  ownerId: string;
  ownerName: string;
  isForSale: boolean;
  openToTrade: boolean;
  creator: {
    display_name: string;
    verified: boolean;
    name_verified: boolean;
  };
  strokeColor: string;
  templateId?: string | null;
  creatorSequenceNumber: number | null;
  seriesName: string | null;
  seriesSequenceNumber: number | null;
  seriesMaxSize: number | null;
  offerLockedUntil?: string | null;
  printCount: number;
  thumbnailUrl?: string | null;
};

type MarketplaceCursor = {
  beforeCreatedAt: string;
  beforeId: string;
};

type MarketplaceFilters = {
  savedOnly: boolean;
  buyNow: boolean;
  creator: string;
  series: string;
  minPrice: string;
  maxPrice: string;
};

const defaultFilters: MarketplaceFilters = {
  savedOnly: false,
  buyNow: false,
  creator: '',
  series: '',
  minPrice: '',
  maxPrice: '',
};

type MarketplaceSort = 'newest' | 'oldest' | 'price_asc' | 'price_desc';

function getListingPriceLabel(item: Pick<ListingItem, 'listingMode'>) {
  return item.listingMode === 'buy_now' ? 'Fixed Price' : 'Estimated Value';
}

function canBuyNow(item: Pick<ListingItem, 'saleState' | 'listingMode'>) {
  return item.saleState === 'fixed' && item.listingMode === 'buy_now';
}

function canMakeOffer(item: Pick<ListingItem, 'saleState' | 'listingMode'>) {
  return item.saleState === 'fixed' && item.listingMode === 'make_offer';
}

function getPreviewPriceText(item: Pick<ListingItem, 'offerLockedUntil' | 'priceCents'>) {
  return item.offerLockedUntil ? 'Sale Pending' : formatPublicVideoPrice(item.priceCents);
}

function formatCardDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
}

export default function MarketplaceScreen() {
  const PAGE_SIZE = 30;
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [recommendedIds, setRecommendedIds] = useState<string[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<MarketplaceCursor | null>(null);
  const [loadError, setLoadError] = useState(false);
  const lastFetchedAt = useRef<number | null>(null);
  const STALE_MS = 30_000; // re-fetch only if data is older than 30 seconds
  const [filterVisible, setFilterVisible] = useState(false);
  const [filters, setFilters] = useState<MarketplaceFilters>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<MarketplaceFilters>(defaultFilters);
  const [sort, setSort] = useState<MarketplaceSort>('newest');
  const [draftSort, setDraftSort] = useState<MarketplaceSort>('newest');
  const [previewItem, setPreviewItem] = useState<ListingItem | null>(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [reportItem, setReportItem] = useState<ListingItem | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [certItem, setCertItem] = useState<ListingItem | null>(null);
  const [offerItem, setOfferItem] = useState<ListingItem | null>(null);
  const [offerInput, setOfferInput] = useState('');
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const offerSlideAnim = useRef(new Animated.Value(0)).current;
  const { user } = useAuth();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const mapRow = (row: any): ListingItem => ({
    id: row.id,
    visibility: 'public',
    saleState: row.sale_state ?? 'fixed',
    listingMode: row.listing_mode === 'buy_now' ? 'buy_now' : 'make_offer',
    creatorId: row.creator_id,
    ownerId: row.owner_id,
    ownerName: row.owner_display_name ?? '—',
    certificateId: row.certificate_id,
    createdAt: row.created_at,
    priceCents: row.price_cents ?? null,
    isForSale: true,
    openToTrade: row.open_to_trade ?? false,
    videoUri: row.video_url ?? null,
    previewFrameUrls: row.preview_frame_urls ?? [],
    previewFrameTimesMs: row.preview_frame_times_ms ?? [],
    thumbnailUrl: row.thumbnail_url ?? null,
    strokes: row.strokes_json ?? [],
    captureWidth: row.capture_width ?? 1,
    captureHeight: row.capture_height ?? 1,
    creator: {
      display_name: row.creator_display_name ?? 'Creator',
      verified: !!row.creator_verified,
      name_verified: !!row.creator_name_verified,
    },
    strokeColor: row.stroke_color ?? '#001B5C',
    templateId: row.template_id ?? 'classic',
    creatorSequenceNumber: row.creator_sequence_number ?? null,
    seriesName: row.series_name ?? null,
    seriesSequenceNumber: row.series_sequence_number ?? null,
    seriesMaxSize: row.series_max_size ?? null,
    offerLockedUntil: row.offer_locked_until ?? null,
    printCount: row.print_count ?? 0,
  });

  const fetchMarketplacePage = useCallback(async (pageCursor: MarketplaceCursor | null) => {
    if (!user) return { items: [] as ListingItem[], nextCursor: null as MarketplaceCursor | null, blockedIds: new Set<string>(), watchedFromList: [] as string[], recommendationIds: [] as string[] };

    const includeAncillary = !pageCursor;
    const [browseRes, watchRes, recommendationsRes, blockedRes] = await Promise.all([
      supabase.rpc('get_marketplace_feed', {
        p_limit: PAGE_SIZE,
        p_before_created_at: pageCursor?.beforeCreatedAt ?? null,
        p_before_id: pageCursor?.beforeId ?? null,
        p_viewer_id: user.id,
      }),
      includeAncillary ? supabase.from('watchlist').select('autograph_id').eq('user_id', user.id) : Promise.resolve({ data: null, error: null } as any),
      includeAncillary ? supabase.rpc('get_marketplace_recommendations', { p_limit: 6 }) : Promise.resolve({ data: null, error: null } as any),
      includeAncillary ? supabase.from('blocked_users').select('blocked_user_id').eq('blocker_id', user.id) : Promise.resolve({ data: null, error: null } as any),
    ]);

    const rows = browseRes.data ?? [];
    const items = rows.map(mapRow);
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: items.length === PAGE_SIZE && last
        ? { beforeCreatedAt: last.createdAt, beforeId: last.id }
        : null,
      blockedIds: new Set<string>((blockedRes.data ?? []).map((row: any) => row.blocked_user_id as string)),
      watchedFromList: (watchRes.data ?? []).map((w: any) => w.autograph_id as string),
      recommendationIds: (recommendationsRes.data ?? []).map((row: any) => row.autograph_id as string),
    };
  }, [user]);

useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (lastFetchedAt.current && Date.now() - lastFetchedAt.current < STALE_MS) return;
      setLoading(true);
      setLoadError(false);

      fetchMarketplacePage(null).then(({ items, nextCursor, blockedIds, watchedFromList, recommendationIds }) => {
        setBlockedUserIds(blockedIds);
        setWatchedIds(new Set(watchedFromList));
        setRecommendedIds(recommendationIds);
        setListings(items);
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
        lastFetchedAt.current = Date.now();
        setLoading(false);
      }).catch((error) => {
        console.log('Load marketplace error:', error);
        setListings([]);
        setRecommendedIds([]);
        setCursor(null);
        setHasMore(false);
        setLoadError(true);
        setLoading(false);
      });
    }, [fetchMarketplacePage, user])
  );

  const handleLoadMore = useCallback(() => {
    if (!user || loading || loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    fetchMarketplacePage(cursor)
      .then(({ items, nextCursor }) => {
        setListings((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          for (const item of items) {
            if (!seen.has(item.id)) merged.push(item);
          }
          return merged;
        });
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
      })
      .catch((error) => {
        console.log('Load more marketplace error:', error);
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }, [cursor, fetchMarketplacePage, hasMore, loading, loadingMore, user]);

  const openPreview = (item: ListingItem) => {
    setPreviewItem(item);
    void logInterestEvent('view_autograph', {
      autographId: item.id,
      creatorId: item.creatorId,
    });
  };

  const closePreview = () => {
    setPreviewItem(null);
  };

  const shareAutograph = async (item: ListingItem) => {
    const autographUrl = buildAutographUrl(item.id);
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? {
              message: `Check out this verified autograph from ${item.creator.display_name} on Ophinia.`,
              url: autographUrl,
            }
          : {
              message: `Check out this verified autograph from ${item.creator.display_name} on Ophinia.\n${autographUrl}`,
            }
      );
    } catch {}
  };

  const openOfferSheet = (item: ListingItem) => {
    setOfferItem(item);
    setOfferInput('');
    offerSlideAnim.setValue(0);
    Animated.timing(offerSlideAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  };

  const closeOfferSheet = () => {
    if (offerSubmitting) return;
    Animated.timing(offerSlideAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      setOfferItem(null);
      setOfferInput('');
    });
  };

  const handleReport = async (reason: string) => {
    if (!reportItem || !user) return;
    setReportSubmitting(true);
    try {
      const { error } = await supabase.from('reports').insert({
        autograph_id: reportItem.id,
        reporter_id: user.id,
        reason,
      });
      setReportItem(null);
      if (error?.code === '23505') {
        Alert.alert('Already Reported', 'You have already reported this autograph.');
      } else if (error) {
        Alert.alert('Error', 'Could not submit report. Please try again.');
      } else {
        Alert.alert('Report Submitted', 'Thank you. Our team will review this content.');
      }
    } finally {
      setReportSubmitting(false);
    }
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

  const handleToggleBlockedUser = async (targetUserId: string, label: string, shouldBlock: boolean) => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to manage blocked users.');
      return;
    }
    if (targetUserId === user.id) return;

    try {
      if (shouldBlock) {
        const { error } = await supabase.from('blocked_users').insert({
          blocker_id: user.id,
          blocked_user_id: targetUserId,
        });
        if (error && error.code !== '23505') throw error;
        setBlockedUserIds((prev) => new Set(prev).add(targetUserId));
        setListings((prev) => prev.filter((item) => item.ownerId !== targetUserId && item.creatorId !== targetUserId));
        setPreviewItem(null);
        setContextMenuVisible(false);
        Alert.alert('User Blocked', `${label} has been blocked. Their listings are now hidden.`);
      } else {
        const { error } = await supabase
          .from('blocked_users')
          .delete()
          .eq('blocker_id', user.id)
          .eq('blocked_user_id', targetUserId);
        if (error) throw error;
        setBlockedUserIds((prev) => {
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
        setContextMenuVisible(false);
        Alert.alert('User Unblocked', `${label} has been unblocked. Refresh the marketplace to see their listings again.`);
      }
    } catch {
      Alert.alert('Block Failed', `Could not ${shouldBlock ? 'block' : 'unblock'} this user. Please try again.`);
    }
  };

  const formatCentsInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    const cents = Number.parseInt(digits, 10);
    return (cents / 100).toFixed(2);
  };

  const handleOfferChange = (text: string) => setOfferInput(formatCentsInput(text));

  const handleCreateOffer = async () => {
    if (!offerItem) return;
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to make an offer.');
      return;
    }
    const amount = Number.parseFloat(offerInput);

    if (Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid offer amount greater than $0.');
      return;
    }

    setOfferSubmitting(true);
    try {
      // Disclosure required before collecting payment details.
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Offer Authorization',
          `Submitting an offer places a temporary authorization hold of $${amount.toFixed(2)} on your card. Your card is only charged if the seller accepts. Payment is processed by Stripe, Ophinia's authorized payment partner.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Continue', onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirmed) return;

      const paymentData = await callEdgeFunction<{
        client_secret: string;
        payment_intent_id: string;
        payment_event_id: string;
      }>('create-offer-commitment-payment-intent', {
        autograph_id: offerItem.id,
        amount_cents: Math.round(amount * 100),
      });

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: paymentData.client_secret,
        merchantDisplayName: 'Ophinia',
      });

      if (initError) {
        Alert.alert('Authorization Error', 'Could not start payment authorization. Please try again.');
        return;
      }

      const { error: paymentError } = await presentPaymentSheet();
      if (paymentError) {
        if (paymentError.code !== 'Canceled') {
          Alert.alert('Authorization Failed', 'Could not confirm your offer authorization. Please try again.');
        }
        return;
      }

      await callEdgeFunction('create-autograph-offer', {
        autograph_id: offerItem.id,
        amount_cents: Math.round(amount * 100),
        payment_event_id: paymentData.payment_event_id,
      });
      closeOfferSheet();
      Alert.alert('Offer Sent', 'Your offer was sent and the authorization hold is now in place.');
    } catch (error) {
      Alert.alert(
        'Offer Failed',
        error instanceof Error ? error.message : 'Could not create your offer. Please try again.',
      );
    } finally {
      setOfferSubmitting(false);
    }
  };

  const handlePurchase = async (item: ListingItem) => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to purchase autographs.');
      return;
    }
    setPurchasingId(item.id);
    try {
      closePreview();
      await openAuthenticatedWebPath(`/app/checkout/${item.id}`);
      Alert.alert('Continue on Web', `Checkout for ${item.creator.display_name} has been moved to Ophinia on the web.`);
    } catch {
      Alert.alert('Error', 'Could not open the web checkout. Please try again.');
    } finally {
      setPurchasingId(null);
    }
  };

  const activeListings = useMemo(() => {
    let items = listings;
    if (filters.savedOnly) items = items.filter((l) => watchedIds.has(l.id));
    if (filters.buyNow) items = items.filter((l) => canBuyNow(l));
    if (filters.creator.trim()) {
      const q = filters.creator.trim().toLowerCase();
      items = items.filter((l) => l.creator.display_name.toLowerCase().includes(q));
    }
    if (filters.series.trim()) {
      const q = filters.series.trim().toLowerCase();
      items = items.filter((l) => l.seriesName?.toLowerCase().includes(q));
    }
    if (filters.minPrice.trim()) {
      const min = parseFloat(filters.minPrice) * 100;
      if (!isNaN(min)) items = items.filter((l) => (l.priceCents ?? 0) >= min);
    }
    if (filters.maxPrice.trim()) {
      const max = parseFloat(filters.maxPrice) * 100;
      if (!isNaN(max)) items = items.filter((l) => (l.priceCents ?? 0) <= max);
    }
    if (sort === 'newest') items = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (sort === 'oldest') items = [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (sort === 'price_asc') items = [...items].sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));
    if (sort === 'price_desc') items = [...items].sort((a, b) => (b.priceCents ?? 0) - (a.priceCents ?? 0));
    return items;
  }, [listings, watchedIds, filters, sort]);

  const isFiltered = filters.savedOnly || filters.buyNow || filters.creator.trim() !== '' || filters.series.trim() !== '' || filters.minPrice !== '' || filters.maxPrice !== '' || sort !== 'newest';

  const recommendedListings = useMemo(() => {
    if (isFiltered) return [];
    const listingMap = new Map(activeListings.map((item) => [item.id, item]));
    return recommendedIds
      .map((id) => listingMap.get(id))
      .filter((item): item is ListingItem => !!item)
      .slice(0, 4);
  }, [activeListings, recommendedIds, isFiltered]);

  const feedListings = useMemo(() => activeListings, [activeListings]);

  const renderMarketplaceCard = (item: ListingItem) => (
    <Pressable style={styles.marketplaceCard} onPress={() => openPreview(item)}>
      <View style={styles.marketplaceThumbnailWrap}>
          <PublicVideoThumbnail
            videoUrl={item.videoUri}
            thumbnailUrl={item.thumbnailUrl}
            previewFrameUrls={item.previewFrameUrls}
            previewFrameTimesMs={item.previewFrameTimesMs}
            strokes={item.strokes}
          captureWidth={item.captureWidth}
          captureHeight={item.captureHeight}
          strokeColor={item.strokeColor}
          shellStyle={styles.marketplaceThumbnail}
        />
        {item.saleState === 'fixed' && (
          <View style={styles.cardOverlayBar}>
            <Text style={styles.cardOverlayPrice} numberOfLines={1}>
              {item.offerLockedUntil ? 'Sale Pending' : formatPublicVideoPrice(item.priceCents)}
            </Text>
            {!item.offerLockedUntil && canBuyNow(item) ? (
              <Pressable
                style={[styles.cardOverlayButton, purchasingId === item.id && { opacity: 0.6 }]}
                onPress={(e) => { e.stopPropagation(); handlePurchase(item); }}
                disabled={purchasingId === item.id}
              >
                {purchasingId === item.id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.cardOverlayButtonText}>Buy</Text>}
              </Pressable>
            ) : !item.offerLockedUntil && canMakeOffer(item) ? (
              <Pressable
                style={styles.cardOverlayButton}
                onPress={(e) => { e.stopPropagation(); openPreview(item); openOfferSheet(item); }}
              >
                <Text style={styles.cardOverlayButtonText}>Offer</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
        <View style={styles.marketplaceCardBody}>
          <NameWithSequence
            name={item.creator.display_name}
            sequenceNumber={item.creatorSequenceNumber}
            style={styles.marketplaceCardName}
          />
          <CardMetadataBlock
            compact
            sequenceNumber={item.creatorSequenceNumber}
            capturedAt={item.createdAt}
            printCount={item.printCount}
            seriesName={item.seriesName}
            seriesEdition={
              item.seriesSequenceNumber != null && item.seriesMaxSize != null
                ? `${item.seriesSequenceNumber} of ${item.seriesMaxSize}`
                : null
            }
          />
        </View>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BrandColors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Could not load the marketplace.</Text>
        <Text style={styles.errorSubtitle}>Check your connection and try again.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterHeaderRow}>
        <Text style={styles.filterResultCount}>{activeListings.length} listing{activeListings.length !== 1 ? 's' : ''}</Text>
        <Pressable
          style={styles.filterLink}
          onPress={() => { setDraftFilters(filters); setDraftSort(sort); setFilterVisible(true); }}
        >
          <Text style={[styles.filterLinkText, isFiltered && styles.filterLinkTextActive]}>
            {isFiltered ? 'Filtered ✕' : 'Filter/Sort'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={feedListings}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.marketplaceGridRow}
        contentContainerStyle={styles.marketplaceGridContent}
        onEndReachedThreshold={0.45}
        onEndReached={handleLoadMore}
        ListEmptyComponent={<Text style={styles.emptyText}>No autographs match your filters.</Text>}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadMoreFooter}>
              <ActivityIndicator size="small" color={BrandColors.primary} />
            </View>
          ) : !isFiltered && hasMore ? (
            <View style={styles.loadMoreFooter}>
              <Text style={styles.loadMoreHint}>Scroll for more listings</Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          !isFiltered && recommendedListings.length > 0 ? (
            <View style={styles.recommendationSection}>
              <Text style={styles.recommendationTitle}>For You</Text>
              <Text style={styles.recommendationSubtitle}>Based on the creators and videos you have been engaging with.</Text>
              <View style={styles.recommendationList}>
                {Array.from({ length: Math.ceil(recommendedListings.length / 2) }, (_, i) =>
                  recommendedListings.slice(i * 2, i * 2 + 2)
                ).map((row, i) => (
                  <View key={i} style={styles.marketplaceGridRow}>
                    {row.map((item) => (
                      <View key={item.id} style={styles.marketplaceGridItem}>
                        {renderMarketplaceCard(item)}
                      </View>
                    ))}
                    {row.length === 1 && <View style={styles.marketplaceGridItem} />}
                  </View>
                ))}
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.marketplaceGridItem}>
            {renderMarketplaceCard(item)}
          </View>
        )}
      />

      <Modal
        visible={!!previewItem}
        animationType="none"
        transparent={false}
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={closePreview}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalTopRow}>
            <Pressable style={styles.closeButton} onPress={closePreview}>
              <Text style={styles.buttonText}>Close</Text>
            </Pressable>
            {previewItem && (
              <View style={styles.modalMeta}>
                <Pressable onPress={() => { closePreview(); router.push(`/profile/${previewItem.creatorId}`); }}>
                  <View style={styles.modalMetaLinkRow}>
                    <NameWithSequence name={previewItem.creator.display_name} sequenceNumber={previewItem.creatorSequenceNumber} style={styles.modalCelebrity} />
                    {previewItem.seriesName ? <Text style={styles.modalCelebrity}>{` · ${previewItem.seriesName}`}</Text> : null}
                  </View>
                </Pressable>
                <Text style={styles.modalPrice}>{formatPublicVideoPrice(previewItem.priceCents)}</Text>
              </View>
            )}
          </View>

          {previewItem && (
            <AutographPlayer
              videoUrl={previewItem.videoUri}
              thumbnailUrl={previewItem.thumbnailUrl}
              previewFrameUrls={previewItem.previewFrameUrls}
              previewFrameTimesMs={previewItem.previewFrameTimesMs}
              templateId={previewItem.templateId}
              strokes={previewItem.strokes}
              strokeColor={previewItem.strokeColor}
              captureWidth={previewItem.captureWidth}
              captureHeight={previewItem.captureHeight}
              onLongPress={() => setContextMenuVisible(true)}
            />
          )}

          {previewItem && (
            <View style={styles.modalMetadataBlock}>
              <View style={styles.modalHeaderRow}>
                <View style={styles.modalHeaderMetaLeft}>
                  <Text style={styles.modalHeaderMetaText}>{formatCardDate(previewItem.createdAt)}</Text>
                </View>
                <View style={styles.modalNameRow}>
                  <NameWithSequence name={previewItem.creator.display_name} sequenceNumber={previewItem.creatorSequenceNumber} style={styles.modalCelebrity} />
                  {previewItem.creator.name_verified && (
                    <Image source={require('../assets/images/Ophinia_badge_navy background.png')} style={styles.nameBadge} resizeMode="contain" />
                  )}
                </View>
                <Pressable style={styles.certificateLink} onPress={() => setCertItem(previewItem)}>
                  <Image source={require('../assets/images/Ophinia_O.png')} style={styles.certificateLogo} resizeMode="contain" />
                </Pressable>
              </View>
              <View style={styles.modalInfoRow}>
                <View style={styles.modalInfoLeft}>
                  <Text style={styles.modalInfoText}>{`Print #${previewItem.printCount + 1}`}</Text>
                </View>
                <View style={styles.modalInfoCenter}>
                  {previewItem.seriesName || (previewItem.seriesSequenceNumber != null && previewItem.seriesMaxSize != null) ? (
                    <Text style={styles.modalSeriesText} numberOfLines={1}>
                      {previewItem.seriesName ?? ''}
                      {previewItem.seriesName && previewItem.seriesSequenceNumber != null && previewItem.seriesMaxSize != null ? ' · ' : ''}
                      {previewItem.seriesSequenceNumber != null && previewItem.seriesMaxSize != null
                        ? `${previewItem.seriesSequenceNumber} of ${previewItem.seriesMaxSize}`
                        : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.modalInfoRow}>
                <View style={styles.modalInfoLeft}>
                  <Text style={styles.modalInfoText}>{`Listed by ${previewItem.ownerName || previewItem.creator.display_name}`}</Text>
                </View>
                <View style={styles.modalInfoCenter} />
              </View>
              <View style={styles.modalUtilityRow}>
                <Pressable style={styles.modalUtilityButton} onPress={() => { void shareAutograph(previewItem); }}>
                  <Text style={styles.modalUtilityButtonText}>Share</Text>
                </Pressable>
              </View>
            </View>
          )}

          {previewItem && previewItem.ownerId !== user?.id && (
            <View style={styles.modalActionBar}>
              <Text style={styles.modalActionPrice}>{getPreviewPriceText(previewItem)}</Text>
              {!previewItem.offerLockedUntil && canBuyNow(previewItem) ? (
                <Pressable
                  style={[styles.modalActionButton, purchasingId === previewItem.id && { opacity: 0.6 }]}
                  onPress={() => handlePurchase(previewItem)}
                  disabled={purchasingId === previewItem.id}
                >
                  {purchasingId === previewItem.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.modalActionButtonText}>Buy Now</Text>}
                </Pressable>
              ) : !previewItem.offerLockedUntil && canMakeOffer(previewItem) ? (
                <Pressable style={styles.modalActionButton} onPress={() => openOfferSheet(previewItem)}>
                  <Text style={styles.modalActionButtonText}>Make Offer</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {/* Context menu — long press / right-click on video */}
          {contextMenuVisible && previewItem && (
            <Pressable style={styles.contextOverlay} onPress={() => setContextMenuVisible(false)}>
              <View style={styles.contextMenu} onStartShouldSetResponder={() => true}>
                <Text style={styles.contextMenuTitle}>{previewItem.creator.display_name}</Text>

                <Pressable
                  style={styles.contextMenuItem}
                  onPress={() => { setContextMenuVisible(false); void shareAutograph(previewItem); }}
                >
                  <Text style={styles.contextMenuItemText}>Share</Text>
                </Pressable>

                {previewItem.ownerId !== user?.id && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => { setContextMenuVisible(false); toggleWatch(previewItem); }}
                  >
                    <Text style={styles.contextMenuItemText}>
                      {watchedIds.has(previewItem.id) ? 'Unsave' : 'Save'}
                    </Text>
                  </Pressable>
                )}

                {previewItem.ownerId !== user?.id && !previewItem.offerLockedUntil && canMakeOffer(previewItem) && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => {
                      const item = previewItem;
                      setContextMenuVisible(false);
                      openOfferSheet(item);
                    }}
                  >
                    <Text style={styles.contextMenuItemText}>Make Offer</Text>
                  </Pressable>
                )}

                {previewItem.ownerId !== user?.id && !previewItem.offerLockedUntil && canBuyNow(previewItem) && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => { setContextMenuVisible(false); handlePurchase(previewItem); }}
                  >
                    <Text style={styles.contextMenuItemText}>Buy · {formatPublicVideoPrice(previewItem.priceCents)}</Text>
                  </Pressable>
                )}

                {previewItem.ownerId !== user?.id && previewItem.offerLockedUntil ? (
                  <View style={styles.contextMenuItem}>
                    <Text style={styles.contextMenuItemText}>Sale Pending</Text>
                  </View>
                ) : null}

                <Pressable
                  style={styles.contextMenuItem}
                  onPress={() => { setContextMenuVisible(false); setCertItem(previewItem); }}
                >
                  <Text style={styles.contextMenuItemText}>Certificate of Authenticity</Text>
                </Pressable>

                {previewItem.ownerId !== previewItem.creatorId && (
                  <Pressable
                    style={styles.contextMenuItem}
                  onPress={() => { const id = previewItem.creatorId; setContextMenuVisible(false); closePreview(); router.push(`/profile/${id}`); }}
                  >
                    <Text style={styles.contextMenuItemText}>Creator Profile</Text>
                  </Pressable>
                )}

                {previewItem.ownerId !== previewItem.creatorId && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => { const id = previewItem.ownerId; setContextMenuVisible(false); closePreview(); router.push(`/profile/${id}`); }}
                  >
                    <Text style={styles.contextMenuItemText}>Seller Profile</Text>
                  </Pressable>
                )}

                {previewItem.ownerId !== user?.id && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => {
                      void handleToggleBlockedUser(
                        previewItem.ownerId,
                        previewItem.ownerName || previewItem.creator.display_name,
                        !blockedUserIds.has(previewItem.ownerId),
                      );
                    }}
                  >
                    <Text style={[styles.contextMenuItemText, { color: '#FF3B30' }]}>
                      {blockedUserIds.has(previewItem.ownerId) ? 'Unblock Seller' : 'Block Seller'}
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  style={styles.contextMenuItem}
                  onPress={() => { setContextMenuVisible(false); setReportItem(previewItem); }}
                >
                  <Text style={[styles.contextMenuItemText, { color: '#FF3B30' }]}>Report</Text>
                </Pressable>
              </View>
            </Pressable>
          )}

          {/* Report reason sheet */}
          {reportItem && (
            <Pressable style={styles.contextOverlay} onPress={() => setReportItem(null)}>
              <View style={styles.contextMenu} onStartShouldSetResponder={() => true}>
                <Text style={styles.contextMenuTitle}>Report Autograph</Text>
                {[
                  { reason: 'impersonation', label: 'Impersonation' },
                  { reason: 'offensive_content', label: 'Offensive Content' },
                  { reason: 'fraudulent_listing', label: 'Fraudulent Listing' },
                  { reason: 'copyright_issue', label: 'Copyright / IP Issue' },
                ].map(({ reason, label }) => (
                  <Pressable
                    key={reason}
                    style={styles.contextMenuItem}
                    onPress={() => handleReport(reason)}
                    disabled={reportSubmitting}
                  >
                    <Text style={styles.contextMenuItemText}>{label}</Text>
                  </Pressable>
                ))}
                <Pressable style={styles.contextMenuItem} onPress={() => setReportItem(null)}>
                  <Text style={[styles.contextMenuItemText, { color: '#888' }]}>Cancel</Text>
                </Pressable>
              </View>
            </Pressable>
          )}

          {/* Certificate sheet */}
          {certItem && (
            <CertificateSheet
              signedBy={certItem.creator.display_name}
              currentOwner={certItem.ownerName}
              dateCaptured={formatPublicVideoDate(certItem.createdAt)}
              edition={certItem.seriesName && certItem.seriesSequenceNumber != null && certItem.seriesMaxSize != null
                ? `${certItem.seriesName} — #${certItem.seriesSequenceNumber} of ${certItem.seriesMaxSize}`
                : null}
              certificateId={certItem.certificateId}
              primaryActionLabel="Seller Profile"
              onPrimaryAction={() => {
                setCertItem(null);
                router.push(`/profile/${certItem.ownerId}`);
              }}
              onClose={() => setCertItem(null)}
            />
          )}

          {/* Offer sheet — animated View inside modal avoids iOS modal-stacking issues */}
          {offerItem && (
            <Pressable style={styles.offerBackdrop} onPress={closeOfferSheet} />
          )}
          {offerItem && (
            <Animated.View
              style={[
                styles.offerKeyboardView,
                { transform: [{ translateY: offerSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }] },
              ]}
            >
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.offerSheet} onStartShouldSetResponder={() => true}>
                  <Text style={styles.offerTitle}>Make Offer</Text>
                  <Text style={styles.offerSubtitle}>
                    {offerItem.creator.display_name}
                    {offerItem.priceCents ? ` · ${getListingPriceLabel(offerItem)} ${formatPublicVideoPrice(offerItem.priceCents)}` : ''}
                    {' · '}Expires in 24 hours if not accepted
                  </Text>
                  <TextInput
                    style={styles.offerInput}
                    placeholder="Offer amount in USD"
                    placeholderTextColor="#999"
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    value={offerInput}
                    onChangeText={handleOfferChange}
                    editable={!offerSubmitting}
                  />
                  <Pressable
                    style={[styles.offerButton, offerSubmitting && { opacity: 0.6 }]}
                    onPress={handleCreateOffer}
                    disabled={offerSubmitting}
                  >
                    <Text style={styles.offerButtonText}>{offerSubmitting ? 'Sending…' : 'Send Offer'}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.offerCancelButton}
                    onPress={closeOfferSheet}
                    disabled={offerSubmitting}
                  >
                    <Text style={styles.offerCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </KeyboardAvoidingView>
            </Animated.View>
          )}

        </View>
      </Modal>

      {/* Filter sheet */}
      <Modal
        visible={filterVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterVisible(false)}
      >
        <View style={styles.filterOverlay}>
          <ScrollView style={{ width: '100%' }} contentContainerStyle={styles.filterSheet} keyboardShouldPersistTaps="handled">
            <Text style={styles.filterTitle}>Filter</Text>

            <Text style={styles.filterSectionLabel}>Type</Text>
            <View style={styles.filterCheckGroup}>
              {[
                { key: 'savedOnly', label: 'Saved only' },
                { key: 'buyNow', label: 'Buy Now' },
              ].map(({ key, label }) => (
                <Pressable
                  key={key}
                  style={styles.filterCheckRow}
                  onPress={() => setDraftFilters((prev) => ({ ...prev, [key]: !prev[key as keyof MarketplaceFilters] }))}
                >
                  <View style={[styles.filterCheckbox, draftFilters[key as keyof MarketplaceFilters] && styles.filterCheckboxChecked]}>
                    {draftFilters[key as keyof MarketplaceFilters] && <Text style={styles.filterCheckTick}>✓</Text>}
                  </View>
                  <Text style={styles.filterCheckLabel}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.filterSectionLabel}>Celebrity / Autographer</Text>
            <TextInput
              style={styles.filterInput}
              placeholder="e.g. Taylor Swift"
              placeholderTextColor="#aaa"
              value={draftFilters.creator}
              onChangeText={(v) => setDraftFilters((prev) => ({ ...prev, creator: v }))}
              autoCorrect={false}
            />

            <Text style={styles.filterSectionLabel}>Series</Text>
            <TextInput
              style={styles.filterInput}
              placeholder="e.g. Hawaii Trip"
              placeholderTextColor="#aaa"
              value={draftFilters.series}
              onChangeText={(v) => setDraftFilters((prev) => ({ ...prev, series: v }))}
              autoCorrect={false}
            />

            <Text style={styles.filterSectionLabel}>Price Range ($)</Text>
            <View style={styles.filterRangeRow}>
              <TextInput
                style={[styles.filterInput, { flex: 1 }]}
                placeholder="Min"
                placeholderTextColor="#aaa"
                keyboardType="decimal-pad"
                value={draftFilters.minPrice}
                onChangeText={(v) => setDraftFilters((prev) => ({ ...prev, minPrice: v }))}
              />
              <Text style={styles.filterRangeSep}>–</Text>
              <TextInput
                style={[styles.filterInput, { flex: 1 }]}
                placeholder="Max"
                placeholderTextColor="#aaa"
                keyboardType="decimal-pad"
                value={draftFilters.maxPrice}
                onChangeText={(v) => setDraftFilters((prev) => ({ ...prev, maxPrice: v }))}
              />
            </View>

            <Text style={styles.filterSectionLabel}>Sort By</Text>
            <View style={styles.filterCheckGroup}>
              {([
                { key: 'newest', label: 'Newest first' },
                { key: 'oldest', label: 'Oldest first' },
                { key: 'price_asc', label: 'Price: Low to High' },
                { key: 'price_desc', label: 'Price: High to Low' },
              ] as { key: MarketplaceSort; label: string }[]).map(({ key, label }) => (
                <Pressable key={key} style={styles.filterCheckRow} onPress={() => setDraftSort(key)}>
                  <View style={[styles.filterCheckbox, draftSort === key && styles.filterCheckboxChecked]}>
                    {draftSort === key && <Text style={styles.filterCheckTick}>✓</Text>}
                  </View>
                  <Text style={styles.filterCheckLabel}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.filterApplyButton}
              onPress={() => { setFilters(draftFilters); setSort(draftSort); setFilterVisible(false); }}
            >
              <Text style={styles.filterApplyText}>Apply</Text>
            </Pressable>
            <Pressable
              style={styles.filterClearButton}
              onPress={() => { setFilters(defaultFilters); setDraftFilters(defaultFilters); setSort('newest'); setDraftSort('newest'); setFilterVisible(false); }}
            >
              <Text style={styles.filterClearText}>Clear All</Text>
            </Pressable>
            <Pressable style={{ marginTop: 8, marginBottom: 16 }} onPress={() => setFilterVisible(false)}>
              <Text style={styles.tradeCancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.background,
    paddingHorizontal: 16,
    paddingBottom: 0,
    paddingTop: 0,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BrandColors.background,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    fontFamily: BrandFonts.primary,
    textAlign: 'center',
    marginBottom: 6,
  },
  errorSubtitle: {
    fontSize: 14,
    color: '#888',
    fontFamily: BrandFonts.primary,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
  },
  separator: {
    height: 14,
  },
  recommendationSection: {
    marginBottom: 18,
  },
  recommendationTitle: {
    fontSize: 28,
    color: '#111',
    fontFamily: BrandFonts.script,
  },
  recommendationSubtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 14,
    lineHeight: 20,
    color: '#6e6454',
    fontFamily: BrandFonts.primary,
  },
  recommendationList: {
    gap: 0,
  },
  marketplaceGridRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 12,
    marginBottom: 12,
  },
  marketplaceGridContent: {
    paddingBottom: 24,
    paddingTop: 8,
  },
  loadMoreFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  loadMoreHint: {
    fontSize: 13,
    color: '#777',
    fontFamily: BrandFonts.primary,
  },
  marketplaceGridItem: {
    flex: 1,
  },
  modalActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e9dcc1',
  },
  modalActionPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  modalActionButton: {
    backgroundColor: BrandColors.primary,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  modalActionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  marketplaceThumbnailWrap: {
    position: 'relative',
  },
  cardOverlayBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cardOverlayPrice: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
    flexShrink: 1,
  },
  cardOverlayButton: {
    backgroundColor: BrandColors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 6,
  },
  cardOverlayButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  marketplaceCard: {
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e9dcc1',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    overflow: 'hidden',
  },
  marketplaceThumbnail: {
    width: '100%',
    aspectRatio: 60 / 85,
    height: undefined,
    borderRadius: 0,
  },
  marketplaceCardBody: {
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 8,
  },
  marketplaceCardName: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  marketplaceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  marketplaceCreatorColumn: {
    flex: 1,
  },
  marketplaceListedByColumn: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: '42%',
  },
  marketplaceNameLink: {
    flex: 1,
    alignSelf: 'flex-start',
  },
  marketplaceNameLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  marketplaceNameLinkCue: {
    fontSize: 18,
    lineHeight: 18,
    color: '#777',
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
    marginTop: 1,
  },
  marketplaceSeriesSlot: {
    height: 18,
    marginTop: 3,
    justifyContent: 'center',
  },
  marketplaceSeriesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  marketplaceSeriesCopy: {
    flex: 1,
  },
  marketplaceSeries: {
    fontSize: 13,
    lineHeight: 14,
    fontFamily: BrandFonts.primary,
    fontStyle: 'italic',
  },
  marketplaceSeriesName: {
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  marketplaceSeriesEdition: {
    color: '#888',
    fontFamily: BrandFonts.primary,
    fontStyle: 'normal',
  },
  marketplaceBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  marketplaceVerifiedBadge: {
    fontSize: 11,
    color: '#fff',
    backgroundColor: '#111',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
  },
  marketplaceGoldBadge: {
    fontSize: 11,
    color: '#7A4B00',
    backgroundColor: '#F7E5BF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
  },
  marketplacePriceRow: {
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  marketplaceActionColumn: {
    alignItems: 'flex-end',
  },
  marketplaceActionButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  marketplaceActionButtonText: {
    color: '#111',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  marketplacePrice: {
    fontSize: 21,
    lineHeight: 24,
    fontWeight: '800',
    color: '#111',
    fontFamily: BrandFonts.primary,
    flex: 1,
  },
  marketplaceListedBy: {
    fontSize: 13,
    lineHeight: 18,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  marketplaceListedByInline: {
    fontSize: 12,
    lineHeight: 14,
    color: '#666',
    fontFamily: BrandFonts.primary,
    textAlign: 'right',
  },
  marketplaceListedByLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: '#888',
    fontFamily: BrandFonts.primary,
    textAlign: 'right',
    flexShrink: 0,
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
  tapHint: {
    fontSize: 12,
    color: '#8A7D67',
    marginTop: 4,
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
  modalMetaLinkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  modalCelebrity: {
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontSize: 19,
    fontWeight: '600',
  },
  modalNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nameBadge: {
    width: 20,
    height: 20,
  },
  modalMetadataBlock: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: 'black',
    alignItems: 'center',
  },
  modalHeaderRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 34,
    marginBottom: 6,
  },
  modalHeaderMetaLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'flex-start',
    gap: 2,
  },
  modalHeaderMetaText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
  },
  modalInfoRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 18,
    marginTop: 2,
  },
  modalInfoLeft: {
    width: '44%',
    alignItems: 'flex-start',
  },
  modalInfoCenter: {
    width: '40%',
    alignItems: 'center',
  },
  modalInfoText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
  },
  modalSeriesText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#d9d9d9',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalUtilityRow: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  modalUtilityButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  modalUtilityButtonText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
  },
  certificateLink: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 2,
  },
  certificateLogo: {
    width: 34,
    height: 34,
    opacity: 0.85,
    tintColor: '#fff',
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
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  controlButtonText: {
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
  },
  certOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    paddingTop: 80,
  },
  certSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  certTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
    color: '#111',
    marginBottom: 16,
  },
  certRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  certLabel: {
    fontSize: 13,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  certValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
    fontFamily: BrandFonts.primary,
    maxWidth: '60%',
    textAlign: 'right',
  },
  certIdValue: {
    fontSize: 11,
    color: '#333',
    fontFamily: 'monospace',
    maxWidth: '60%',
    textAlign: 'right',
  },
  certButton: {
    marginTop: 20,
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  certButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  certCloseText: {
    fontSize: 15,
    color: '#666',
    fontFamily: BrandFonts.primary,
    marginTop: 4,
  },
  offerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  offerKeyboardView: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  offerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  offerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    fontFamily: BrandFonts.primary,
  },
  offerSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
    fontFamily: BrandFonts.primary,
  },
  offerInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 18,
    color: '#111',
    borderWidth: 1,
    borderColor: '#ddd',
    fontFamily: BrandFonts.primary,
  },
  offerButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  offerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  offerCancelButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  offerCancelText: {
    color: '#666',
    fontSize: 15,
    fontFamily: BrandFonts.primary,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  filterResultCount: {
    fontSize: 13,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  filterLink: {
    paddingVertical: 4,
  },
  filterLinkText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
    color: '#666',
  },
  filterLinkTextActive: {
    color: '#111',
  },
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    marginBottom: 20,
  },
  filterSectionLabel: {
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  filterCheckGroup: {
    gap: 4,
  },
  filterCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  filterCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#111',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterCheckboxChecked: {
    backgroundColor: '#111',
  },
  filterCheckTick: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  filterCheckLabel: {
    fontSize: 15,
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  filterInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
    borderWidth: 1,
    borderColor: '#ddd',
    fontFamily: BrandFonts.primary,
  },
  filterRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterRangeSep: {
    fontSize: 16,
    color: '#999',
  },
  filterApplyButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  filterApplyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  filterClearButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#111',
  },
  filterClearText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  contextOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenu: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    width: 260,
    overflow: 'hidden',
  },
  contextMenuTitle: {
    color: '#888',
    fontSize: 13,
    fontFamily: BrandFonts.primary,
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  contextMenuItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  contextMenuItemText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: BrandFonts.primary,
    textAlign: 'center',
  },
});

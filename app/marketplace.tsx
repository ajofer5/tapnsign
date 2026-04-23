import { AutographPlayer } from '@/components/autograph-player';
import { CertificateSheet } from '@/components/certificate-sheet';
import { NameWithSequence, PublicVideoCard, formatPublicVideoDate, formatPublicVideoPrice } from '@/components/public-video-card';
import { PublicVideoThumbnail } from '@/components/public-video-thumbnail';
import { BrandColors, BrandFonts } from '@/constants/theme';
import { callEdgeFunction } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { logInterestEvent } from '@/lib/interest';
import { supabase } from '@/lib/supabase';
import { useStripe } from '@stripe/stripe-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
  priceCents: number | null;
  videoUri: string;
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
  };
  strokeColor: string;
  creatorSequenceNumber: number | null;
  seriesName: string | null;
  seriesSequenceNumber: number | null;
  seriesMaxSize: number | null;
  offerLockedUntil?: string | null;
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

function MarketplaceThumbnail({ item }: { item: ListingItem }) {
  return (
    <PublicVideoThumbnail
      videoUrl={item.videoUri}
      strokes={item.strokes}
      captureWidth={item.captureWidth}
      captureHeight={item.captureHeight}
      strokeColor={item.strokeColor}
    />
  );
}

export default function MarketplaceScreen() {
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [recommendedIds, setRecommendedIds] = useState<string[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
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
  const [certItem, setCertItem] = useState<ListingItem | null>(null);
  const [offerItem, setOfferItem] = useState<ListingItem | null>(null);
  const [offerInput, setOfferInput] = useState('');
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const { user } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const router = useRouter();

  const mapRow = (row: any): ListingItem => ({
    id: row.id,
    visibility: row.visibility ?? 'private',
    saleState: row.sale_state ?? (row.is_for_sale ? 'fixed' : 'not_for_sale'),
    creatorId: row.creator_id,
    ownerId: row.owner_id,
    ownerName: row.owner?.display_name ?? '—',
    certificateId: row.certificate_id,
    createdAt: row.created_at,
    priceCents: row.price_cents ?? null,
    isForSale: row.is_for_sale ?? false,
    openToTrade: row.open_to_trade ?? false,
    videoUri: row.video_url,
    strokes: row.strokes_json ?? [],
    captureWidth: row.capture_width ?? 1,
    captureHeight: row.capture_height ?? 1,
    creator: row.creator,
    strokeColor: row.stroke_color ?? '#FA0909',
    creatorSequenceNumber: row.creator_sequence_number ?? null,
    seriesName: null,
    seriesSequenceNumber: row.series_sequence_number ?? null,
    seriesMaxSize: null,
  });

useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (lastFetchedAt.current && Date.now() - lastFetchedAt.current < STALE_MS) return;
      setLoading(true);

      const baseQuery = `
        id, creator_id, owner_id, certificate_id, created_at, visibility, sale_state, price_cents,
        open_to_trade, is_for_sale,
        video_url, strokes_json, capture_width, capture_height,
        creator_sequence_number, series_id, series_sequence_number,
        creator:creator_id ( display_name, verified ),
        owner:owner_id ( display_name )
      `;

      (async () => {
        return Promise.all([
          supabase.from('autographs').select(baseQuery).eq('visibility', 'public').eq('sale_state', 'fixed').order('created_at', { ascending: false }),
          supabase.from('watchlist').select('autograph_id').eq('user_id', user.id),
          supabase.rpc('get_marketplace_recommendations', { p_limit: 6 }),
        ]);
      })().then(async ([browseRes, watchRes, recommendationsRes]) => {
        const browseItems = (browseRes.data ?? []).map(mapRow);

        // Fetch series names for listings that belong to a series
        const rawRows = browseRes.data ?? [];
        const seriesIds = [...new Set(rawRows.map((r: any) => r.series_id).filter(Boolean))] as string[];
        if (seriesIds.length > 0) {
          const { data: seriesRows } = await supabase.from('series').select('id, name, max_size').in('id', seriesIds);
          const seriesMap: Record<string, { name: string; max_size: number }> = {};
          for (const s of seriesRows ?? []) seriesMap[s.id] = { name: s.name, max_size: s.max_size };
          browseItems.forEach((item, idx) => {
            const raw = rawRows[idx] as any;
            if (raw?.series_id && seriesMap[raw.series_id]) {
              item.seriesName = seriesMap[raw.series_id].name;
              item.seriesMaxSize = seriesMap[raw.series_id].max_size;
            }
          });
        }

        // Merge watchlist items
        const watchedFromList = (watchRes.data ?? []).map((w: any) => w.autograph_id);
        setWatchedIds(new Set(watchedFromList));
        const browseIds = browseItems.map((item) => item.id);
        const recommendationIds = (recommendationsRes.data ?? []).map((row: any) => row.autograph_id as string);
        if (browseIds.length > 0) {
          const nowIso = new Date().toISOString();
          const { data: lockedOffers } = await supabase
            .from('autograph_offers')
            .select('autograph_id, payment_due_at')
            .in('autograph_id', browseIds)
            .eq('status', 'accepted')
            .is('accepted_transfer_id', null)
            .gt('payment_due_at', nowIso);

          const lockedMap = new Map<string, string | null>();
          for (const offer of lockedOffers ?? []) {
            lockedMap.set(offer.autograph_id, offer.payment_due_at ?? null);
          }

          setListings(
            browseItems
              .filter((item) => !lockedMap.has(item.id))
              .map((item) => ({ ...item, offerLockedUntil: lockedMap.get(item.id) ?? null }))
          );
          setRecommendedIds(recommendationIds.filter((id) => !lockedMap.has(id)));
        } else {
          setListings(browseItems);
          setRecommendedIds(recommendationIds);
        }
        lastFetchedAt.current = Date.now();
        setLoading(false);
      }).catch((error) => {
        console.log('Load marketplace error:', error);
        setListings([]);
        setRecommendedIds([]);
        setLoadError(true);
        setLoading(false);
      });
    }, [user])
  );

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

  const formatCentsInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    const cents = Number.parseInt(digits, 10);
    return (cents / 100).toFixed(2);
  };

  const handleOfferChange = (text: string) => setOfferInput(formatCentsInput(text));

  const handleCreateOffer = async () => {
    if (!offerItem) return;
    const amount = Number.parseFloat(offerInput);

    if (Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid offer amount greater than $0.');
      return;
    }

    setOfferSubmitting(true);
    try {
      await callEdgeFunction('create-autograph-offer', {
        autograph_id: offerItem.id,
        amount_cents: Math.round(amount * 100),
      });
      setOfferItem(null);
      setOfferInput('');
      Alert.alert('Offer Sent', 'Your offer was sent and will expire in 24 hours if it is not answered.');
    } catch {
      Alert.alert('Offer Failed', 'Could not send offer. Please try again.');
    } finally {
      setOfferSubmitting(false);
    }
  };

  const handlePurchase = async (item: ListingItem) => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to purchase autographs.');
      return;
    }
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

      const { error: paymentError } = await presentPaymentSheet();

      if (paymentError) {
        if (paymentError.code !== 'Canceled') Alert.alert('Payment Failed', paymentError.message);
        return;
      }

      await callEdgeFunction('purchase-autograph', {
        autograph_id: item.id,
        payment_event_id,
      });

      closePreview();
      Alert.alert(
        'Purchase Complete!',
        `You now own this autograph by ${item.creator.display_name}.`,
        [{ text: 'View My Autographs', onPress: () => router.push('/autographs') }]
      );
      setListings((prev) => prev.filter((l) => l.id !== item.id));
    } catch {
      Alert.alert('Error', 'Could not complete purchase. Please try again.');
    }
  };

  const activeListings = useMemo(() => {
    let items = listings;
    if (filters.savedOnly) items = items.filter((l) => watchedIds.has(l.id));
    if (filters.buyNow) items = items.filter((l) => l.isForSale);
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
      .slice(0, 3);
  }, [activeListings, recommendedIds, isFiltered]);

  const recommendedIdSet = useMemo(() => new Set(recommendedListings.map((item) => item.id)), [recommendedListings]);
  const feedListings = useMemo(
    () => (isFiltered ? activeListings : activeListings.filter((item) => !recommendedIdSet.has(item.id))),
    [activeListings, isFiltered, recommendedIdSet]
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
          style={[styles.filterButton, isFiltered && styles.filterButtonActive]}
          onPress={() => { setDraftFilters(filters); setDraftSort(sort); setFilterVisible(true); }}
        >
          <Text style={[styles.filterButtonText, isFiltered && styles.filterButtonTextActive]}>
            {isFiltered ? 'Filtered ✕' : 'Filter/Sort'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={feedListings}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>No autographs match your filters.</Text>}
        ListHeaderComponent={
          !isFiltered && recommendedListings.length > 0 ? (
            <View style={styles.recommendationSection}>
              <Text style={styles.recommendationTitle}>For You</Text>
              <Text style={styles.recommendationSubtitle}>Based on the creators and videos you have been engaging with.</Text>
              <View style={styles.recommendationList}>
                {recommendedListings.map((item) => (
                  <View key={item.id} style={styles.recommendationCardWrap}>
                    <PublicVideoCard
                      name={item.creator.display_name}
                      sequenceNumber={item.creatorSequenceNumber}
                      seriesName={item.seriesName}
                      seriesEdition={item.seriesSequenceNumber != null && item.seriesMaxSize != null ? `${item.seriesSequenceNumber} of ${item.seriesMaxSize}` : null}
                      date={formatPublicVideoDate(item.createdAt)}
                      verified={item.creator.verified}
                      priceLabel="Estimated Value"
                      priceText={formatPublicVideoPrice(item.priceCents)}
                      secondaryText={`Listed by ${item.ownerName}`}
                      onPress={() => openPreview(item)}
                      renderThumbnail={() => <MarketplaceThumbnail item={item} />}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <PublicVideoCard
            name={item.creator.display_name}
            sequenceNumber={item.creatorSequenceNumber}
            seriesName={item.seriesName}
            seriesEdition={item.seriesSequenceNumber != null && item.seriesMaxSize != null ? `${item.seriesSequenceNumber} of ${item.seriesMaxSize}` : null}
            date={formatPublicVideoDate(item.createdAt)}
            verified={item.creator.verified}
            priceLabel="Estimated Value"
            priceText={formatPublicVideoPrice(item.priceCents)}
            secondaryText={`Listed by ${item.ownerName}`}
            onPress={() => openPreview(item)}
            renderThumbnail={() => <MarketplaceThumbnail item={item} />}
          />
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
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', textDecorationLine: 'underline' } as any}>
                    <NameWithSequence name={previewItem.creator.display_name} sequenceNumber={previewItem.creatorSequenceNumber} style={[styles.modalCelebrity, { textDecorationLine: 'underline' }] as any} />
                    {previewItem.seriesName ? <Text style={[styles.modalCelebrity, { textDecorationLine: 'underline' }]}>{` · ${previewItem.seriesName}`}</Text> : null}
                  </View>
                </Pressable>
                <Text style={styles.modalPriceLabel}>Estimated Value</Text>
                <Text style={styles.modalPrice}>{formatPublicVideoPrice(previewItem.priceCents)}</Text>
              </View>
            )}
          </View>

          {previewItem && (
            <AutographPlayer
              videoUrl={previewItem.videoUri}
              strokes={previewItem.strokes}
              strokeColor={previewItem.strokeColor}
              captureWidth={previewItem.captureWidth}
              captureHeight={previewItem.captureHeight}
              onCertificate={() => setCertItem(previewItem)}
              onLongPress={() => setContextMenuVisible(true)}
            />
          )}

          {/* Context menu — long press / right-click on video */}
          {contextMenuVisible && previewItem && (
            <Pressable style={styles.contextOverlay} onPress={() => setContextMenuVisible(false)}>
              <View style={styles.contextMenu} onStartShouldSetResponder={() => true}>
                <Text style={styles.contextMenuTitle}>{previewItem.creator.display_name}</Text>

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

                {previewItem.ownerId !== user?.id && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => {
                      const item = previewItem;
                      setContextMenuVisible(false);
                      setOfferItem(item);
                      setOfferInput('');
                    }}
                  >
                    <Text style={styles.contextMenuItemText}>Make Offer</Text>
                  </Pressable>
                )}

                {previewItem.ownerId !== user?.id && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => { setContextMenuVisible(false); handlePurchase(previewItem); }}
                  >
                    <Text style={styles.contextMenuItemText}>Buy · {formatPublicVideoPrice(previewItem.priceCents)}</Text>
                  </Pressable>
                )}

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

          {/* Offer sheet — rendered inside video modal to avoid modal stacking on iOS */}
          {offerItem && (
            <>
              <Pressable
                style={styles.offerBackdrop}
                onPress={() => { if (!offerSubmitting) { setOfferItem(null); setOfferInput(''); } }}
              />
              <KeyboardAvoidingView
                style={styles.offerKeyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              >
                <View style={styles.offerSheet} onStartShouldSetResponder={() => true}>
                  <Text style={styles.offerTitle}>Make Offer</Text>
                  <Text style={styles.offerSubtitle}>
                    {offerItem.creator.display_name}
                    {offerItem.priceCents ? ` · Estimated Value ${formatPublicVideoPrice(offerItem.priceCents)}` : ''}
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
                    onPress={() => { if (!offerSubmitting) { setOfferItem(null); setOfferInput(''); } }}
                    disabled={offerSubmitting}
                  >
                    <Text style={styles.offerCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </KeyboardAvoidingView>
            </>
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
    padding: 16,
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
    gap: 12,
  },
  recommendationCardWrap: {
    marginBottom: 12,
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
  price: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
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
    fontSize: 19,
    fontWeight: '600',
  },
  modalPriceLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: BrandFonts.primary,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    marginBottom: 12,
  },
  filterResultCount: {
    fontSize: 13,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#666',
  },
  filterButtonActive: {
    backgroundColor: '#666',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
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

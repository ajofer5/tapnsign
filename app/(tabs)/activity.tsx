import { BrandColors, BrandFonts } from '@/constants/theme';
import { AutographPlayer } from '@/components/autograph-player';
import { NameWithSequence } from '@/components/public-video-card';
import { callEdgeFunction } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { openAuthenticatedWebPath } from '@/lib/web-handoff';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type ActivityEntry = {
  id: string;
  type:
    | 'sold'
    | 'purchased'
    | 'offer_received'
    | 'offer_sent'
    | 'offer_on_hold'
    | 'offer_accepted'
    | 'offer_declined'
    | 'offer_withdrawn'
    | 'offer_expired'
    | 'personalized_request_received'
    | 'personalized_request_sent'
    | 'personalized_request_countered'
    | 'personalized_request_accepted'
    | 'personalized_request_declined'
    | 'personalized_request_withdrawn'
    | 'personalized_request_expired'
    | 'personalized_request_fulfilled'
    | 'personalized_request_completed';
  autographId: string | null;
  creatorName: string;
  creatorSequenceNumber?: number | null;
  seriesName?: string | null;
  amountCents: number;
  date: string;
  status?: 'pending' | 'accepted' | 'on_hold' | 'declined' | 'withdrawn' | 'expired' | 'countered' | 'fulfilled' | 'completed';
  offerId?: string | null;
  offerRole?: 'owner' | 'buyer';
  expiresAt?: string | null;
  paymentDueAt?: string | null;
  acceptedTransferId?: string | null;
  personalizedRequestId?: string | null;
  requestRole?: 'creator' | 'requester';
  recipientName?: string | null;
  inscriptionText?: string | null;
  completedTransferId?: string | null;
  isActionable?: boolean;
};

type ActivityCursor = {
  beforeEventAt: string;
  beforeFeedId: string;
};

type ActivityFeedRow = {
  feed_id: string;
  event_type: ActivityEntry['type'];
  autograph_id: string | null;
  creator_name: string;
  creator_sequence_number: number | null;
  series_name: string | null;
  amount_cents: number;
  event_at: string;
  status: ActivityEntry['status'] | null;
  offer_id: string | null;
  offer_role: ActivityEntry['offerRole'] | null;
  expires_at: string | null;
  payment_due_at: string | null;
  accepted_transfer_id: string | null;
  personalized_request_id: string | null;
  request_role: ActivityEntry['requestRole'] | null;
  recipient_name: string | null;
  inscription_text: string | null;
  completed_transfer_id: string | null;
  is_actionable: boolean;
};

type Point = { x: number; y: number; t: number };
type Stroke = { id: string; points: Point[] };

type PreviewAutograph = {
  id: string;
  certificateId: string;
  createdAt: string;
  creatorName: string;
  creatorSequenceNumber?: number | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  previewFrameUrls: string[];
  previewFrameTimesMs: number[];
  strokes: Stroke[];
  strokeColor: string;
  templateId?: string | null;
  captureWidth: number;
  captureHeight: number;
};

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDeadline(value: string) {
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

const EVENT_CONFIG: Record<ActivityEntry['type'], { label: string }> = {
  sold:         { label: 'Sold' },
  purchased:    { label: 'Purchased' },
  offer_received: { label: 'Offer Received' },
  offer_sent: { label: 'Offer Sent' },
  offer_on_hold: { label: 'Offer On Hold' },
  offer_accepted: { label: 'Offer Accepted' },
  offer_declined: { label: 'Offer Declined' },
  offer_withdrawn: { label: 'Offer Withdrawn' },
  offer_expired: { label: 'Offer Expired' },
  personalized_request_received: { label: 'Personalized Request Received' },
  personalized_request_sent: { label: 'Personalized Request Sent' },
  personalized_request_countered: { label: 'Personalized Request Countered' },
  personalized_request_accepted: { label: 'Personalized Request Accepted' },
  personalized_request_declined: { label: 'Personalized Request Declined' },
  personalized_request_withdrawn: { label: 'Personalized Request Withdrawn' },
  personalized_request_expired: { label: 'Personalized Request Expired' },
  personalized_request_fulfilled: { label: 'Personalized Request Ready' },
  personalized_request_completed: { label: 'Personalized Request Complete' },
};

function activityViewedKey(userId: string) {
  return `activity_last_viewed_${userId}`;
}

const ACTIVITY_STALE_MS = 30_000;
const ACTIVITY_PAGE_SIZE = 40;

export default function ActivityScreen() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<ActivityCursor | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<PreviewAutograph | null>(null);
  const { user } = useAuth();
  const appUrl = process.env.EXPO_PUBLIC_APP_URL ?? 'https://tapnsign.app';
  const router = useRouter();
  const lastLoadedAtRef = useRef<number | null>(null);
  const mapFeedRow = useCallback((row: ActivityFeedRow): ActivityEntry => ({
    id: row.feed_id,
    type: row.event_type,
    autographId: row.autograph_id,
    creatorName: row.creator_name,
    creatorSequenceNumber: row.creator_sequence_number ?? null,
    seriesName: row.series_name ?? null,
    amountCents: row.amount_cents,
    date: row.event_at,
    status: row.status ?? undefined,
    offerId: row.offer_id ?? undefined,
    offerRole: row.offer_role ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    paymentDueAt: row.payment_due_at ?? undefined,
    acceptedTransferId: row.accepted_transfer_id ?? undefined,
    personalizedRequestId: row.personalized_request_id ?? undefined,
    requestRole: row.request_role ?? undefined,
    recipientName: row.recipient_name ?? undefined,
    inscriptionText: row.inscription_text ?? undefined,
    completedTransferId: row.completed_transfer_id ?? undefined,
    isActionable: row.is_actionable,
  }), []);

  const fetchActivityPage = useCallback(async (pageCursor: ActivityCursor | null) => {
    if (!user) {
      return { items: [] as ActivityEntry[], nextCursor: null as ActivityCursor | null };
    }

    const { data, error } = await supabase.rpc('get_activity_feed', {
      p_user_id: user.id,
      p_limit: ACTIVITY_PAGE_SIZE,
      p_before_event_at: pageCursor?.beforeEventAt ?? null,
      p_before_feed_id: pageCursor?.beforeFeedId ?? null,
    });

    if (error) {
      throw error;
    }

    const rows = (data as ActivityFeedRow[] | null) ?? [];
    const items = rows.map(mapFeedRow);
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: items.length === ACTIVITY_PAGE_SIZE && last
        ? { beforeEventAt: last.date, beforeFeedId: last.id }
        : null,
    };
  }, [mapFeedRow, user]);

  const loadEntries = useCallback(async (options?: { force?: boolean }) => {
    if (!user) return Promise.resolve();
    const now = Date.now();
    if (!options?.force && lastLoadedAtRef.current && now - lastLoadedAtRef.current < ACTIVITY_STALE_MS) {
      return;
    }

    setLoading(true);
    setLoadError(false);
    setLoadErrorMessage(null);

    try {
      const { items, nextCursor } = await fetchActivityPage(null);
      setEntries(items);
      setCursor(nextCursor);
      setHasMore(!!nextCursor);
      lastLoadedAtRef.current = Date.now();
      AsyncStorage.setItem(activityViewedKey(user.id), new Date().toISOString()).catch(() => {});
    } catch (error) {
      console.log('Load activity error:', error);
      const message = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Check your connection and try again.';
      setEntries([]);
      setCursor(null);
      setHasMore(false);
      setLoadError(true);
      setLoadErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [fetchActivityPage, user]);

  const handleOfferAction = async (entry: ActivityEntry, action: 'accept' | 'decline' | 'withdraw') => {
    if (!entry.offerId) return;
    setActioningId(entry.id);
    try {
      if (action === 'withdraw') {
        await callEdgeFunction('withdraw-autograph-offer', {
          offer_id: entry.offerId,
        });
      } else {
        await callEdgeFunction('respond-autograph-offer', {
          offer_id: entry.offerId,
          action,
        });
      }
      await loadEntries({ force: true });
    } catch {
      Alert.alert('Offer Error', 'Could not update offer. Please try again.');
    } finally {
      setActioningId(null);
    }
  };

  const handleOpenPersonalizedRequests = () => {
    router.push('/personalized-requests');
  };

  const handleCompletePersonalizedPurchase = async (entry: ActivityEntry) => {
    if (!entry.personalizedRequestId) return;
    setActioningId(entry.id);
    try {
      await openAuthenticatedWebPath(`/app/personalized-requests/${entry.personalizedRequestId}/checkout`);
      Alert.alert('Continue on Web', 'Personalized request payment has been moved to Ophinia on the web.');
    } catch {
      Alert.alert('Checkout Error', 'Could not open personalized checkout. Please try again.');
    } finally {
      setActioningId(null);
    }
  };

  const handleCompleteOfferPurchase = async (entry: ActivityEntry) => {
    if (!entry.offerId) return;
    setActioningId(entry.id);
    try {
      await openAuthenticatedWebPath(`/app/offers/${entry.offerId}/checkout`);
      Alert.alert('Continue on Web', 'Accepted-offer payment has been moved to Ophinia on the web.');
    } catch {
      Alert.alert('Purchase Error', 'Could not open the web checkout. Please try again.');
    } finally {
      setActioningId(null);
    }
  };

  const handlePreviewAcceptedOffer = async (entry: ActivityEntry) => {
    setPreviewLoadingId(entry.id);
    try {
      const { data, error } = await supabase
        .from('autographs')
        .select('id, certificate_id, created_at, video_url, thumbnail_url, preview_frame_urls, preview_frame_times_ms, strokes_json, stroke_color, template_id, capture_width, capture_height')
        .eq('id', entry.autographId)
        .single();

      if (error || (!data?.video_url && !data?.thumbnail_url && !(data?.preview_frame_urls?.length))) {
        throw new Error('Could not load this autograph.');
      }

      setPreviewItem({
        id: data.id,
        certificateId: data.certificate_id,
        createdAt: data.created_at,
        creatorName: entry.creatorName,
        creatorSequenceNumber: entry.creatorSequenceNumber,
        videoUrl: data.video_url ?? null,
        thumbnailUrl: data.thumbnail_url ?? null,
        previewFrameUrls: data.preview_frame_urls ?? [],
        previewFrameTimesMs: data.preview_frame_times_ms ?? [],
        strokes: data.strokes_json ?? [],
        strokeColor: data.stroke_color ?? '#001B5C',
        templateId: data.template_id ?? 'classic',
        captureWidth: data.capture_width ?? 1,
        captureHeight: data.capture_height ?? 1,
      });
    } catch {
      Alert.alert('Preview Error', 'Could not load this autograph. Please try again.');
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleLoadMore = useCallback(() => {
    if (!user || loading || loadingMore || !hasMore || !cursor) return;

    setLoadingMore(true);
    fetchActivityPage(cursor)
      .then(({ items, nextCursor }) => {
        setEntries((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          for (const item of items) {
            if (!seen.has(item.id)) {
              merged.push(item);
            }
          }
          return merged;
        });
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
      })
      .catch((error) => {
        console.log('Load more activity error:', error);
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }, [cursor, fetchActivityPage, hasMore, loading, loadingMore, user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void loadEntries();
    }, [user, loadEntries])
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
        <Text style={styles.errorTitle}>Could not load your activity.</Text>
        <Text style={styles.errorSubtitle}>{loadErrorMessage ?? 'Check your connection and try again.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Activity</Text>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>No activity yet.</Text>}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadMoreFooter}>
              <ActivityIndicator size="small" color={BrandColors.primary} />
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => {
          const config = EVENT_CONFIG[item.type];
          const canPreviewBeforePurchase =
            item.type === 'offer_accepted' &&
            item.offerRole === 'buyer' &&
            !item.acceptedTransferId;
          return (
            <View style={styles.row}>
              <Pressable
                style={[styles.rowMiddle, canPreviewBeforePurchase && styles.rowMiddlePressable]}
                onPress={canPreviewBeforePurchase ? () => handlePreviewAcceptedOffer(item) : undefined}
                disabled={!canPreviewBeforePurchase || previewLoadingId === item.id}
              >
                <Text style={styles.label}>{config.label}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 2, marginLeft: 10 }}>
                  <NameWithSequence name={item.creatorName} sequenceNumber={item.creatorSequenceNumber} style={styles.celebrityInner} />
                  {item.seriesName ? <Text style={styles.celebrityInner}>{` · ${item.seriesName}`}</Text> : null}
                </View>
                {item.type === 'offer_received' && item.expiresAt ? (
                  <Text style={styles.offerMeta}>Expires {formatDeadline(item.expiresAt)}</Text>
                ) : null}
                {item.type === 'offer_sent' && item.expiresAt ? (
                  <Text style={styles.offerMeta}>Pending · Expires {formatDeadline(item.expiresAt)}</Text>
                ) : null}
                {item.type === 'offer_on_hold' && item.offerRole === 'buyer' ? (
                  <Text style={styles.offerMeta}>
                    On hold while another buyer completes payment.
                  </Text>
                ) : null}
                {item.type === 'offer_on_hold' && item.offerRole === 'owner' ? (
                  <Text style={styles.offerMeta}>
                    Backup offer — waiting in case current buyer does not complete payment.
                  </Text>
                ) : null}
                {item.type === 'offer_accepted' && item.offerRole === 'buyer' && item.paymentDueAt && !item.acceptedTransferId ? (
                  <Text style={styles.offerMeta}>Accepted · Pay by {formatDeadline(item.paymentDueAt)}</Text>
                ) : null}
                {item.type === 'offer_accepted' && item.offerRole === 'owner' && item.paymentDueAt && !item.acceptedTransferId ? (
                  <Text style={styles.offerMeta}>Accepted · Awaiting buyer payment until {formatDeadline(item.paymentDueAt)}</Text>
                ) : null}
                {item.type === 'personalized_request_received' && item.recipientName ? (
                  <Text style={styles.offerMeta}>New request for {item.recipientName}.</Text>
                ) : null}
                {item.type === 'personalized_request_sent' && item.recipientName && item.expiresAt ? (
                  <Text style={styles.offerMeta}>Pending for {item.recipientName} · Expires {formatDeadline(item.expiresAt)}</Text>
                ) : null}
                {item.type === 'personalized_request_countered' && item.recipientName ? (
                  <Text style={styles.offerMeta}>Counter received for {item.recipientName}.</Text>
                ) : null}
                {item.type === 'personalized_request_accepted' && item.recipientName ? (
                  <Text style={styles.offerMeta}>Accepted for {item.recipientName}.</Text>
                ) : null}
                {item.type === 'personalized_request_declined' && item.recipientName ? (
                  <Text style={styles.offerMeta}>Declined for {item.recipientName}.</Text>
                ) : null}
                {item.type === 'personalized_request_withdrawn' && item.recipientName ? (
                  <Text style={styles.offerMeta}>Withdrawn for {item.recipientName}.</Text>
                ) : null}
                {item.type === 'personalized_request_expired' && item.recipientName ? (
                  <Text style={styles.offerMeta}>Expired for {item.recipientName}.</Text>
                ) : null}
                {item.type === 'personalized_request_fulfilled' && item.requestRole === 'requester' && item.paymentDueAt ? (
                  <Text style={styles.offerMeta}>Ready for payment · Pay by {formatDeadline(item.paymentDueAt)}</Text>
                ) : null}
                {item.type === 'personalized_request_fulfilled' && item.requestRole === 'creator' ? (
                  <Text style={styles.offerMeta}>Recorded and waiting on buyer payment.</Text>
                ) : null}
                {item.type === 'personalized_request_completed' && item.recipientName ? (
                  <Text style={styles.offerMeta}>Completed for {item.recipientName}.</Text>
                ) : null}
                {canPreviewBeforePurchase ? (
                  <Text style={styles.offerPreviewHint}>
                    {previewLoadingId === item.id ? 'Loading video…' : 'Tap to review video before paying'}
                  </Text>
                ) : null}
              </Pressable>
              <View style={styles.rowRight}>
                <Text style={styles.amount}>{formatPrice(item.amountCents)}</Text>
                <Text style={styles.date}>{formatDate(item.date)}</Text>
                {item.type === 'offer_received' && (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.offerActionButton, actioningId === item.id && styles.offerActionButtonDisabled]}
                      onPress={() => handleOfferAction(item, 'accept')}
                      disabled={actioningId === item.id}
                    >
                      <Text style={styles.offerActionPrimaryText}>{actioningId === item.id ? '...' : 'Accept'}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.offerActionButton, styles.offerActionSecondaryButton, actioningId === item.id && styles.offerActionButtonDisabled]}
                      onPress={() => handleOfferAction(item, 'decline')}
                      disabled={actioningId === item.id}
                    >
                      <Text style={styles.offerActionSecondaryText}>Decline</Text>
                    </Pressable>
                  </View>
                )}
                {(item.type === 'offer_sent' || (item.type === 'offer_on_hold' && item.offerRole === 'buyer')) && (
                  <Pressable
                    style={[styles.offerActionButton, styles.offerActionSecondaryButton, styles.singleActionButton, actioningId === item.id && styles.offerActionButtonDisabled]}
                    onPress={() => handleOfferAction(item, 'withdraw')}
                    disabled={actioningId === item.id}
                  >
                    <Text style={styles.offerActionSecondaryText}>{actioningId === item.id ? '...' : 'Withdraw'}</Text>
                  </Pressable>
                )}
                {item.type === 'offer_accepted' && item.offerRole === 'buyer' && !item.acceptedTransferId && (
                  <Pressable
                    style={[styles.offerActionButton, styles.singleActionButton, actioningId === item.id && styles.offerActionButtonDisabled]}
                    onPress={() => handleCompleteOfferPurchase(item)}
                    disabled={actioningId === item.id}
                  >
                    <Text style={styles.offerActionPrimaryText}>{actioningId === item.id ? '...' : 'Complete Purchase'}</Text>
                  </Pressable>
                )}
                {(item.type === 'personalized_request_received' ||
                  item.type === 'personalized_request_countered' ||
                  item.type === 'personalized_request_accepted' ||
                  item.type === 'personalized_request_declined' ||
                  item.type === 'personalized_request_withdrawn' ||
                  item.type === 'personalized_request_expired' ||
                  (item.type === 'personalized_request_fulfilled' && item.requestRole === 'creator')) && (
                  <Pressable
                    style={[styles.offerActionButton, styles.offerActionSecondaryButton, styles.singleActionButton]}
                    onPress={handleOpenPersonalizedRequests}
                  >
                    <Text style={styles.offerActionSecondaryText}>View Requests</Text>
                  </Pressable>
                )}
                {item.type === 'personalized_request_fulfilled' && item.requestRole === 'requester' && !item.completedTransferId && (
                  <Pressable
                    style={[styles.offerActionButton, styles.singleActionButton, actioningId === item.id && styles.offerActionButtonDisabled]}
                    onPress={() => handleCompletePersonalizedPurchase(item)}
                    disabled={actioningId === item.id}
                  >
                    <Text style={styles.offerActionPrimaryText}>{actioningId === item.id ? '...' : 'Complete Payment'}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />

      <Modal
        visible={!!previewItem}
        animationType="none"
        transparent={false}
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={() => setPreviewItem(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalTopRow}>
            <Pressable style={styles.closeButton} onPress={() => setPreviewItem(null)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>

          {previewItem ? (
            <>
              <AutographPlayer
                videoUrl={previewItem.videoUrl}
                thumbnailUrl={previewItem.thumbnailUrl}
                previewFrameUrls={previewItem.previewFrameUrls}
                previewFrameTimesMs={previewItem.previewFrameTimesMs}
                templateId={previewItem.templateId}
                strokes={previewItem.strokes}
                strokeColor={previewItem.strokeColor}
                captureWidth={previewItem.captureWidth}
                captureHeight={previewItem.captureHeight}
                hintText="Tap to play"
              />
              <View style={styles.modalMetadataBlock}>
                <View style={styles.modalHeaderRow}>
                  <View style={[styles.modalMetaText, { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }]}>
                    <NameWithSequence name={previewItem.creatorName} sequenceNumber={previewItem.creatorSequenceNumber} style={styles.modalMetaTextInner} />
                    <Text style={styles.modalMetaTextInner}>{` · ${formatDate(previewItem.createdAt)}`}</Text>
                  </View>
                  <Pressable style={styles.certificateLink} onPress={() => Linking.openURL(`${appUrl}/verify/${previewItem.certificateId}`)}>
                    <Image source={require('../../assets/images/Ophinia_O.png')} style={styles.certificateLogo} resizeMode="contain" />
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}
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
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    fontFamily: BrandFonts.primary,
    marginBottom: 16,
    marginTop: 40,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#000',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
  },
  loadMoreFooter: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: '#ccc',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  rowMiddle: {
    flex: 1,
  },
  rowMiddlePressable: {
    paddingVertical: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    fontFamily: BrandFonts.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  celebrity: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    fontFamily: BrandFonts.primary,
    marginTop: 2,
    marginLeft: 10,
  },
  celebrityInner: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    fontFamily: BrandFonts.primary,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
    color: '#000',
  },
  date: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  offerMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    marginLeft: 10,
    fontFamily: BrandFonts.primary,
  },
  offerPreviewHint: {
    fontSize: 12,
    color: BrandColors.primary,
    marginTop: 4,
    marginLeft: 10,
    fontFamily: BrandFonts.primary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  offerActionButton: {
    backgroundColor: BrandColors.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  offerActionButtonDisabled: {
    opacity: 0.6,
  },
  offerActionPrimaryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  offerActionSecondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  offerActionSecondaryText: {
    color: '#111',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  singleActionButton: {
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalTopRow: {
    paddingTop: 44,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
  },
  modalMetaText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontFamily: BrandFonts.primary,
  },
  modalMetadataBlock: {
    alignItems: 'center',
    paddingBottom: 16,
    backgroundColor: '#000',
  },
  modalHeaderRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 34,
    marginBottom: 2,
  },
  modalMetaTextInner: {
    color: '#fff',
    fontSize: 14,
    fontFamily: BrandFonts.primary,
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
});

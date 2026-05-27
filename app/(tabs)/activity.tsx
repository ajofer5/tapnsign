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
  status?: 'pending' | 'accepted' | 'on_hold' | 'declined' | 'withdrawn' | 'expired';
  offerRole?: 'owner' | 'buyer';
  expiresAt?: string | null;
  paymentDueAt?: string | null;
  acceptedTransferId?: string | null;
  personalizedRequestId?: string | null;
  requestRole?: 'creator' | 'requester';
  recipientName?: string | null;
  inscriptionText?: string | null;
  completedTransferId?: string | null;
};

type Point = { x: number; y: number; t: number };
type Stroke = { id: string; points: Point[] };

type PreviewAutograph = {
  id: string;
  certificateId: string;
  createdAt: string;
  creatorName: string;
  creatorSequenceNumber?: number | null;
  videoUrl: string;
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

function parseAutographLabel(autograph: any) {
  return {
    creatorName: autograph?.creator?.display_name ?? 'Unknown',
    creatorSequenceNumber: autograph?.creator_sequence_number ?? null,
    seriesName: autograph?.series?.name ?? null,
  };
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

const ACTIVITY_QUERY_LIMIT = 60;
const ACTIVITY_STALE_MS = 30_000;
const EXPIRE_OFFERS_STALE_MS = 5 * 60_000;

export default function ActivityScreen() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<PreviewAutograph | null>(null);
  const { user } = useAuth();
  const appUrl = process.env.EXPO_PUBLIC_APP_URL ?? 'https://tapnsign.app';
  const router = useRouter();
  const lastLoadedAtRef = useRef<number | null>(null);
  const lastExpiredOffersAtRef = useRef<number | null>(null);

  const loadEntries = useCallback(async (options?: { force?: boolean }) => {
    if (!user) return Promise.resolve();
    const now = Date.now();
    if (!options?.force && lastLoadedAtRef.current && now - lastLoadedAtRef.current < ACTIVITY_STALE_MS) {
      return;
    }

    setLoading(true);
    setLoadError(false);

    try {
      if (
        !lastExpiredOffersAtRef.current ||
        now - lastExpiredOffersAtRef.current >= EXPIRE_OFFERS_STALE_MS
      ) {
        await callEdgeFunction('expire-autograph-offers', {});
        lastExpiredOffersAtRef.current = now;
      }

      const [transfersRes, offersRes, personalizedRes] = await Promise.all([
        supabase
          .from('transfers')
          .select('id, autograph_id, from_user_id, to_user_id, price_cents, transferred_at, autograph:autograph_id ( creator_sequence_number, creator:creator_id ( display_name ), series:series_id ( name ) )')
          .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
          .order('transferred_at', { ascending: false })
          .limit(ACTIVITY_QUERY_LIMIT),
        supabase
          .from('autograph_offers')
          .select('id, autograph_id, buyer_id, owner_id, amount_cents, status, created_at, responded_at, expires_at, payment_due_at, accepted_transfer_id, autograph:autograph_id ( creator_sequence_number, creator:creator_id ( display_name ), series:series_id ( name ) )')
          .or(`buyer_id.eq.${user.id},owner_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(ACTIVITY_QUERY_LIMIT),
        supabase
          .from('personalized_autograph_requests')
          .select(`
            id,
            creator_id,
            requester_id,
            minted_autograph_id,
            recipient_name,
            inscription_text,
            amount_cents,
            status,
            created_at,
            responded_at,
            fulfilled_at,
            completed_at,
            expires_at,
            payment_due_at,
            completed_transfer_id,
            creator:creator_id ( display_name ),
            autograph:minted_autograph_id ( creator_sequence_number )
          `)
          .or(`creator_id.eq.${user.id},requester_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(ACTIVITY_QUERY_LIMIT),
      ]);

      const results: ActivityEntry[] = [];

      for (const t of transfersRes.data ?? []) {
        const { creatorName, creatorSequenceNumber, seriesName } = parseAutographLabel(t.autograph);
        if (t.from_user_id === user.id) {
          results.push({ id: `transfer-sold-${t.id}`, type: 'sold', autographId: t.autograph_id, creatorName, creatorSequenceNumber, seriesName, amountCents: t.price_cents, date: t.transferred_at });
        } else {
          results.push({ id: `transfer-purchased-${t.id}`, type: 'purchased', autographId: t.autograph_id, creatorName, creatorSequenceNumber, seriesName, amountCents: t.price_cents, date: t.transferred_at });
        }
      }

      for (const offer of offersRes.data ?? []) {
        const { creatorName, creatorSequenceNumber, seriesName } = parseAutographLabel(offer.autograph);
        const isOwner = offer.owner_id === user.id;
        let type: ActivityEntry['type'];

        if (offer.status === 'pending') {
          type = isOwner ? 'offer_received' : 'offer_sent';
        } else if (offer.status === 'accepted') {
          type = 'offer_accepted';
        } else if (offer.status === 'on_hold') {
          type = 'offer_on_hold';
        } else if (offer.status === 'declined') {
          type = 'offer_declined';
        } else if (offer.status === 'withdrawn') {
          type = 'offer_withdrawn';
        } else {
          type = 'offer_expired';
        }

        results.push({
          id: `offer-${offer.id}`,
          type,
          autographId: offer.autograph_id,
          creatorName,
          creatorSequenceNumber,
          seriesName,
          amountCents: offer.amount_cents,
          date: offer.responded_at ?? offer.created_at,
          status: offer.status,
          offerRole: isOwner ? 'owner' : 'buyer',
          expiresAt: offer.expires_at,
          paymentDueAt: offer.payment_due_at,
          acceptedTransferId: offer.accepted_transfer_id,
        });
      }

      for (const request of personalizedRes.data ?? []) {
        const isCreator = request.creator_id === user.id;
        let type: ActivityEntry['type'];

        if (request.status === 'pending') {
          type = isCreator ? 'personalized_request_received' : 'personalized_request_sent';
        } else if (request.status === 'countered') {
          type = 'personalized_request_countered';
        } else if (request.status === 'accepted') {
          type = 'personalized_request_accepted';
        } else if (request.status === 'declined') {
          type = 'personalized_request_declined';
        } else if (request.status === 'withdrawn') {
          type = 'personalized_request_withdrawn';
        } else if (request.status === 'expired') {
          type = 'personalized_request_expired';
        } else if (request.status === 'fulfilled') {
          type = 'personalized_request_fulfilled';
        } else {
          type = 'personalized_request_completed';
        }

        results.push({
          id: `personalized-${request.id}`,
          type,
          autographId: request.minted_autograph_id ?? null,
          creatorName: (request.creator as any)?.display_name ?? 'Creator',
          creatorSequenceNumber: (request.autograph as any)?.creator_sequence_number ?? null,
          seriesName: null,
          amountCents: request.amount_cents,
          date: request.completed_at ?? request.fulfilled_at ?? request.responded_at ?? request.created_at,
          expiresAt: request.expires_at ?? null,
          paymentDueAt: request.payment_due_at ?? null,
          personalizedRequestId: request.id,
          requestRole: isCreator ? 'creator' : 'requester',
          recipientName: request.recipient_name,
          inscriptionText: request.inscription_text ?? null,
          completedTransferId: request.completed_transfer_id ?? null,
        });
      }

      results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEntries(results);
      lastLoadedAtRef.current = Date.now();
      AsyncStorage.setItem(activityViewedKey(user.id), new Date().toISOString()).catch(() => {});
    } catch (error) {
      console.log('Load activity error:', error);
      setEntries([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleOfferAction = async (entry: ActivityEntry, action: 'accept' | 'decline' | 'withdraw') => {
    setActioningId(entry.id);
    try {
      if (action === 'withdraw') {
        await callEdgeFunction('withdraw-autograph-offer', {
          offer_id: entry.id.replace('offer-', ''),
        });
      } else {
        await callEdgeFunction('respond-autograph-offer', {
          offer_id: entry.id.replace('offer-', ''),
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
    setActioningId(entry.id);
    try {
      const offerId = entry.id.replace('offer-', '');
      await openAuthenticatedWebPath(`/app/offers/${offerId}/checkout`);
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
        .select('id, certificate_id, created_at, video_url, strokes_json, stroke_color, template_id, capture_width, capture_height')
        .eq('id', entry.autographId)
        .single();

      if (error || !data?.video_url) {
        throw new Error('Could not load this video.');
      }

      setPreviewItem({
        id: data.id,
        certificateId: data.certificate_id,
        createdAt: data.created_at,
        creatorName: entry.creatorName,
        creatorSequenceNumber: entry.creatorSequenceNumber,
        videoUrl: data.video_url,
        strokes: data.strokes_json ?? [],
        strokeColor: data.stroke_color ?? '#001B5C',
        templateId: data.template_id ?? 'classic',
        captureWidth: data.capture_width ?? 1,
        captureHeight: data.capture_height ?? 1,
      });
    } catch {
      Alert.alert('Preview Error', 'Could not load this video. Please try again.');
    } finally {
      setPreviewLoadingId(null);
    }
  };

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
        <Text style={styles.errorSubtitle}>Check your connection and try again.</Text>
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
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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

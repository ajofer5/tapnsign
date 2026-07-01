import { AutographPlayer } from '@/components/autograph-player';
import { AutographPrintModal } from '@/components/autograph-print-modal';
import { CardMetadataBlock } from '@/components/card-metadata-block';
import { CertificateSheet } from '@/components/certificate-sheet';
import { ProfileAvatar } from '@/components/profile-avatar';
import { formatPublicVideoDate, formatPublicVideoPrice } from '@/components/public-video-card';
import { PublicVideoThumbnail } from '@/components/public-video-thumbnail';
import { BrandColors, BrandFonts } from '@/constants/theme';
import { getAccountStatusLabel } from '@/lib/account-status';
import { useAuth } from '@/lib/auth-context';
import { callEdgeFunction } from '@/lib/api';
import { logInterestEvent } from '@/lib/interest';
import { buildAutographUrl } from '@/lib/public-links';
import { supabase } from '@/lib/supabase';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useStripe } from '@stripe/stripe-react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  KeyboardAvoidingView,
  Linking,
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

const PROFILE_LISTINGS_PAGE_SIZE = 24;
const PERSONALIZED_REQUEST_ACCESSORY_ID = 'personalized-request-keyboard-actions';

type Point = { x: number; y: number; t: number };
type Stroke = { id: string; points: Point[] };

const PERSONALIZED_REQUEST_MIN_CENTS = 2000;

type Listing = {
  id: string;
  creator_id?: string;
  certificate_id: string;
  created_at: string;
  visibility: 'private' | 'public';
  sale_state: 'not_for_sale' | 'fixed';
  listing_mode?: 'buy_now' | 'make_offer';
  is_for_sale: boolean;
  price_cents: number | null;
  thumbnail_url: string | null;
  print_layout_url?: string | null;
  print_preview_url?: string | null;
  video_url?: string | null;
  preview_frame_urls?: string[] | null;
  preview_frame_times_ms?: number[] | null;
  strokes_json?: Stroke[];
  capture_width?: number;
  capture_height?: number;
  stroke_color: string;
  template_id?: string | null;
  creator_name: string;
  creator_verified: boolean;
  creator_name_verified?: boolean;
  creator_sequence_number?: number | null;
  series_name?: string | null;
  series_sequence_number?: number | null;
  series_max_size?: number | null;
  owner_name?: string | null;
  offer_locked_until?: string | null;
  print_count?: number;
  prints_enabled?: boolean;
  print_limit?: number | null;
};

type Stats = {
  autographs_signed: number;
  unique_series_signed: number;
  gold_signed: number;
  autographs_owned: number;
  unique_creators: number;
  unique_series_owned: number;
  public_videos_count: number;
};

type ProfileData = {
  id: string;
  display_name: string;
  bio?: string | null;
  avatar_url?: string | null;
  profile_avatar_autograph_id?: string | null;
  avatar_autograph?: {
    id: string;
    thumbnail_url: string | null;
    video_url: string | null;
    strokes_json: Stroke[];
    capture_width: number;
    capture_height: number;
    stroke_color: string | null;
  } | null;
  role: string;
  verified: boolean;
  verification_status?: 'none' | 'pending' | 'verified' | 'failed' | 'expired';
  member_since: string;
  first_verified_at?: string | null;
  creator_since?: string | null;
  is_creator: boolean;
  personalized_requests_enabled?: boolean;
  personalized_min_price_cents?: number | null;
  personalized_requests_at_capacity?: boolean;
  stats: Stats;
  public_videos?: Listing[];
  active_listings?: Listing[];
};



function formatNumericDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}


export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [previewItem, setPreviewItem] = useState<Listing | null>(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [reportProfileVisible, setReportProfileVisible] = useState(false);
  const [certItem, setCertItem] = useState<Listing | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [personalizedVisible, setPersonalizedVisible] = useState(false);
  const [personalizedRecipient, setPersonalizedRecipient] = useState('');
  const [personalizedInscription, setPersonalizedInscription] = useState('');
  const [personalizedNote, setPersonalizedNote] = useState('');
  const [personalizedSubmitting, setPersonalizedSubmitting] = useState(false);
  const personalizedSubmitStartedRef = useRef(false);
  const [reportItem, setReportItem] = useState<Listing | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [isBlockedProfile, setIsBlockedProfile] = useState(false);
  const [blockingProfile, setBlockingProfile] = useState(false);
  const [savedCreator, setSavedCreator] = useState(false);
  const [savingCreator, setSavingCreator] = useState(false);
  const [creatorSavedNoticeVisible, setCreatorSavedNoticeVisible] = useState(false);
  const creatorSavedNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibleListingsCount, setVisibleListingsCount] = useState(PROFILE_LISTINGS_PAGE_SIZE);
  const [printItem, setPrintItem] = useState<Listing | null>(null);
  const [printPreview, setPrintPreview] = useState<{ next_print_sequence_number: number; print_layout_url?: string | null; print_preview_url?: string | null; item_cents?: number | null; original_price_cents?: number | null; shipping_cents?: number | null } | null>(null);
  const [loadingPrintPreview, setLoadingPrintPreview] = useState(false);
  const [creatingPrint, setCreatingPrint] = useState(false);
  const [printStep, setPrintStep] = useState<'preview' | 'processing'>('preview');
  const [addressSheetVisible, setAddressSheetVisible] = useState(false);
  const [printSessionKey, setPrintSessionKey] = useState('');
  const [printQuantity, setPrintQuantity] = useState(1);
  const [multiPrintMode, setMultiPrintMode] = useState(false);
  const [selectedPrintIds, setSelectedPrintIds] = useState<string[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const isOwnProfile = user?.id === id;

  useEffect(() => {
    navigation.setOptions({
      headerBackVisible: !isOwnProfile,
      headerLeft: isOwnProfile ? () => null : undefined,
      headerRight: undefined,
    });
  }, [isOwnProfile, navigation, router]);

  const openPreview = (item: Listing) => {
    if (item.video_url || item.thumbnail_url || item.preview_frame_urls?.length) {
      setPreviewItem(item);
      void logInterestEvent('view_autograph', {
        autographId: item.id,
        creatorId: item.creator_id ?? id,
      });
    } else {
      Linking.openURL(buildAutographUrl(item.id));
    }
  };

  const submitReport = async ({
    reason,
    autographId,
    reportedUserId,
  }: {
    reason: string;
    autographId?: string | null;
    reportedUserId?: string | null;
  }) => {
    if (!user) return;
    setReportSubmitting(true);
    try {
      await callEdgeFunction('submit-report', {
        autograph_id: autographId ?? null,
        reported_user_id: reportedUserId ?? null,
        reason,
      });
      setReportItem(null);
      setReportProfileVisible(false);
      Alert.alert('Report Submitted', 'Thank you. Our team will review this content.');
    } catch (error) {
      Alert.alert(
        'Report',
        error instanceof Error ? error.message : 'Could not submit report. Please try again.'
      );
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleReport = async (reason: string) => {
    if (!reportItem) return;
    await submitReport({ reason, autographId: reportItem.id, reportedUserId: reportItem.creator_id ?? id });
  };

  const handleReportAndBlock = async (reason: string) => {
    if (!user) return;
    setReportSubmitting(true);
    try {
      await callEdgeFunction('submit-report', {
        reported_user_id: id ?? null,
        reason,
      });
      if (!isBlockedProfile) {
        const { error } = await supabase.from('blocked_users').insert({
          blocker_id: user.id,
          blocked_user_id: id,
        });
        if (error && error.code !== '23505') throw error;
        setIsBlockedProfile(true);
        setPreviewItem(null);
        setContextMenuVisible(false);
      }
      setReportProfileVisible(false);
      Alert.alert('Reported & Blocked', `${profile?.display_name ?? 'This user'} has been reported and blocked.`);
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Could not complete this action. Please try again.'
      );
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleShare = async (item: Listing) => {
    try {
      await Share.share({
        message: `${item.creator_name} on Ophinia\n${buildAutographUrl(item.id)}`,
        url: buildAutographUrl(item.id),
      });
    } catch {}
  };

  const canBuyPrint = (item: Listing) =>
    !!item.prints_enabled && (item.print_limit == null || (item.print_count ?? 0) < item.print_limit);

  const openPrintPreview = async (item: Listing) => {
    setPreviewItem(null);
    setPrintItem(item);
    setPrintPreview(null);
    setLoadingPrintPreview(true);
    setPrintSessionKey(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      const preview = await callEdgeFunction<{ next_print_sequence_number: number; print_layout_url?: string | null; print_preview_url?: string | null }>(
        'preview-autograph-print',
        { autograph_id: item.id }
      );
      setPrintPreview(preview);
    } catch (error) {
      setPrintItem(null);
      Alert.alert('Print Autograph', error instanceof Error ? error.message : 'Could not load the print preview. Please try again.');
    } finally {
      setLoadingPrintPreview(false);
    }
  };

  const selectedPrintItems = (profile?.public_videos ?? profile?.active_listings ?? [])
    .filter((listing) => selectedPrintIds.includes(listing.id));

  const toggleSelectedPrint = (item: Listing) => {
    setSelectedPrintIds((current) => {
      if (current.includes(item.id)) return current.filter((id) => id !== item.id);
      if (current.length >= 5) return current;
      return [...current, item.id];
    });
  };

  const closeMultiPrintMode = () => {
    setMultiPrintMode(false);
    setSelectedPrintIds([]);
  };

  const openSelectedPrintPreview = async () => {
    const firstItem = selectedPrintItems[0];
    if (!firstItem) return;
    setPreviewItem(null);
    setPrintItem(firstItem);
    setPrintPreview(null);
    setLoadingPrintPreview(true);
    setPrintQuantity(1);
    setPrintSessionKey(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      const preview = await callEdgeFunction<{ next_print_sequence_number: number; print_layout_url?: string | null; print_preview_url?: string | null }>(
        'preview-autograph-print',
        { autograph_id: firstItem.id }
      );
      setPrintPreview(preview);
    } catch (error) {
      setPrintItem(null);
      Alert.alert('Print Autograph', error instanceof Error ? error.message : 'Could not load the print preview. Please try again.');
    } finally {
      setLoadingPrintPreview(false);
    }
  };

  const closePrintPreview = () => {
    if (creatingPrint) return;
    setPrintItem(null);
    setPrintPreview(null);
    setPrintStep('preview');
    setAddressSheetVisible(false);
    setPrintQuantity(1);
    closeMultiPrintMode();
  };

  const handleProceedToPrintPayment = () => {
    if (!printPreview) return;
    setAddressSheetVisible(true);
  };

  const handlePrintAddressSubmit = async (addressDetails: import('@stripe/stripe-react-native').AddressDetails) => {
    setAddressSheetVisible(false);
    if (!printItem || !printPreview) return;
    const bundleAutographIds = selectedPrintItems.length > 1
      ? selectedPrintItems.map((item) => item.id)
      : [printItem.id];
    const orderQuantity = bundleAutographIds.length > 1 ? bundleAutographIds.length : printQuantity;
    const a = addressDetails.address;
    const addr = {
      name: addressDetails.name ?? '',
      line1: a?.line1 ?? '',
      line2: a?.line2 ?? '',
      city: a?.city ?? '',
      state: a?.state ?? '',
      zip: a?.postalCode ?? '',
    };
    setCreatingPrint(true);
    setPrintStep('processing');
    try {
      const paymentData = await callEdgeFunction<{
        client_secret: string;
        payment_intent_id: string;
        payment_event_id: string;
        amount_cents: number;
      }>('create-print-payment-intent', {
        autograph_id: printItem.id,
        autograph_ids: bundleAutographIds,
        idempotency_key: `${printSessionKey}-qty${orderQuantity}`,
        quantity: orderQuantity,
      });

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: paymentData.client_secret,
        merchantDisplayName: 'Ophinia',
      });
      if (initError) {
        Alert.alert('Payment Error', 'Could not start payment. Please try again.');
        setPrintStep('preview');
        setCreatingPrint(false);
        return;
      }

      const { error: paymentError } = await presentPaymentSheet();
      if (paymentError) {
        if (paymentError.code !== 'Canceled') {
          Alert.alert('Payment Failed', 'Could not complete payment. Please try again.');
        }
        setPrintStep('preview');
        setCreatingPrint(false);
        return;
      }

      await callEdgeFunction('submit-print-order', {
        autograph_id: printItem.id,
        autograph_ids: bundleAutographIds,
        payment_event_id: paymentData.payment_event_id,
        image_url: bundleAutographIds.length === 1 ? printPreview.print_layout_url ?? null : null,
        quantity: orderQuantity,
        shipping_name: addr.name,
        shipping_line1: addr.line1,
        shipping_line2: addr.line2 || null,
        shipping_city: addr.city,
        shipping_state: addr.state,
        shipping_zip: addr.zip,
      });

      Alert.alert(
        'Print Order Placed!',
        "Your official print order has been submitted for production. You'll receive an Ophinia shipping email with tracking once your order ships."
      );
      closePrintPreview();
    } catch (error) {
      Alert.alert('Print Order Failed', error instanceof Error ? error.message : 'Could not place your print order. Please try again.');
      setPrintStep('preview');
    } finally {
      setCreatingPrint(false);
    }
  };


  const handleCreatePersonalizedRequest = async () => {
    if (!profile) return;
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to request a personalized print.');
      return;
    }

    const amountCents = Math.max(profile.personalized_min_price_cents ?? 0, PERSONALIZED_REQUEST_MIN_CENTS);
    const amount = amountCents / 100;

    if (!personalizedRecipient.trim()) {
      Alert.alert('Recipient Required', 'Please enter the recipient name for this personalized print.');
      return;
    }

    setPersonalizedSubmitting(true);
    try {
      // Disclosure required before collecting payment details.
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Personalized Print Request',
          `You are commissioning a personalized physical print from ${profile.display_name} for $${amount.toFixed(2)}. A temporary authorization hold will be placed on your card now. You are only charged when the creator completes the personalized print. Payment is processed by Stripe, Ophinia's authorized payment partner.`,
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
      }>('create-personalized-request-payment-intent', {
        creator_id: profile.id,
        recipient_name: personalizedRecipient.trim(),
        inscription_text: personalizedInscription.trim() || null,
        requester_note: personalizedNote.trim() || null,
        amount_cents: amountCents,
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
          Alert.alert('Authorization Failed', 'Could not confirm your payment authorization. Please try again.');
        }
        return;
      }

      await callEdgeFunction('create-personalized-autograph-request', {
        creator_id: profile.id,
        recipient_name: personalizedRecipient.trim(),
        inscription_text: personalizedInscription.trim() || null,
        requester_note: personalizedNote.trim() || null,
        amount_cents: amountCents,
        payment_event_id: paymentData.payment_event_id,
      });
      setPersonalizedVisible(false);
      Alert.alert(
        'Request Sent',
        'Your personalized print request has been sent and your payment authorization is in place. You can track updates in Personalized Requests from your account.'
      );
    } catch (error) {
      Alert.alert(
        'Request Failed',
        error instanceof Error ? error.message : 'Could not send personalized request. Please try again.'
      );
    } finally {
      setPersonalizedSubmitting(false);
    }
  };

  const handlePersonalizedSubmitPress = () => {
    if (personalizedSubmitting || personalizedSubmitStartedRef.current) return;
    personalizedSubmitStartedRef.current = true;
    void handleCreatePersonalizedRequest().finally(() => {
      personalizedSubmitStartedRef.current = false;
    });
  };

  const handleToggleBlockedProfile = async (shouldBlock: boolean) => {
    if (!user || !id || isOwnProfile) return;
    setBlockingProfile(true);
    try {
      if (shouldBlock) {
        const { error } = await supabase.from('blocked_users').insert({
          blocker_id: user.id,
          blocked_user_id: id,
        });
        if (error && error.code !== '23505') throw error;
        setIsBlockedProfile(true);
        setPreviewItem(null);
        setContextMenuVisible(false);
        Alert.alert('User Blocked', `${profile?.display_name ?? 'This user'} has been blocked. Their public prints are now hidden.`);
      } else {
        const { error } = await supabase
          .from('blocked_users')
          .delete()
          .eq('blocker_id', user.id)
          .eq('blocked_user_id', id);
        if (error) throw error;
        setIsBlockedProfile(false);
        Alert.alert('User Unblocked', `${profile?.display_name ?? 'This user'} has been unblocked.`);
      }
    } catch {
      Alert.alert('Block Failed', `Could not ${shouldBlock ? 'block' : 'unblock'} this user. Please try again.`);
    } finally {
      setBlockingProfile(false);
    }
  };

  const handleToggleSavedCreator = async () => {
    if (!user || !id || isOwnProfile || savingCreator) return;
    const next = !savedCreator;
    setSavingCreator(true);
    try {
      if (next) {
        const { error } = await supabase
          .from('saved_creators')
          .insert({ user_id: user.id, creator_id: id });
        if (error && error.code !== '23505') throw error;
        setSavedCreator(true);
        if (creatorSavedNoticeTimerRef.current) {
          clearTimeout(creatorSavedNoticeTimerRef.current);
        }
        setCreatorSavedNoticeVisible(true);
        creatorSavedNoticeTimerRef.current = setTimeout(() => {
          setCreatorSavedNoticeVisible(false);
          creatorSavedNoticeTimerRef.current = null;
        }, 1800);
      } else {
        const { error } = await supabase
          .from('saved_creators')
          .delete()
          .eq('user_id', user.id)
          .eq('creator_id', id);
        if (error) throw error;
        setSavedCreator(false);
        setCreatorSavedNoticeVisible(false);
      }
    } catch (error) {
      console.log('Saved creator toggle error:', error);
      const message =
        typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
          ? error.message
          : `Could not ${next ? 'save' : 'unsave'} this creator. Please try again.`;
      Alert.alert('Saved Creators', message);
    } finally {
      setSavingCreator(false);
    }
  };

  const toggleWatch = async (item: Listing) => {
    if (!user) return;
    const isWatched = watchedIds.has(item.id);
    setWatchedIds((prev) => {
      const next = new Set(prev);
      if (isWatched) next.delete(item.id); else next.add(item.id);
      return next;
    });
    try {
      if (isWatched) {
        await supabase.from('watchlist').delete().eq('user_id', user.id).eq('autograph_id', item.id);
      } else {
        await supabase.from('watchlist').insert({ user_id: user.id, autograph_id: item.id });
      }
    } catch {
      setWatchedIds((prev) => {
        const next = new Set(prev);
        if (isWatched) next.add(item.id); else next.delete(item.id);
        return next;
      });
    }
  };

  useEffect(() => {
    return () => {
      if (creatorSavedNoticeTimerRef.current) {
        clearTimeout(creatorSavedNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setVisibleListingsCount(PROFILE_LISTINGS_PAGE_SIZE);
    supabase.rpc('get_profile_page', { p_user_id: id })
      .then(async ({ data, error }) => {
        setLoading(false);
        if (error || !data) { setNotFound(true); return; }
        const profileData = data as ProfileData;
        if (profileData.personalized_requests_enabled) {
          const { count } = await supabase
            .from('personalized_autograph_requests')
            .select('id', { count: 'exact', head: true })
            .eq('creator_id', id)
            .in('status', ['pending', 'countered', 'accepted', 'fulfilled']);

          if ((count ?? 0) >= 15) {
            profileData.personalized_requests_enabled = false;
            profileData.personalized_requests_at_capacity = true;
          }
        }

        if (user?.id && user.id !== id) {
          const [{ data: blockedRow }, { data: savedRow }, { data: watchRows }] = await Promise.all([
            supabase
              .from('blocked_users')
              .select('blocked_user_id')
              .eq('blocker_id', user.id)
              .eq('blocked_user_id', id)
              .maybeSingle(),
            supabase
              .from('saved_creators')
              .select('creator_id')
              .eq('user_id', user.id)
              .eq('creator_id', id)
              .maybeSingle(),
            supabase
              .from('watchlist')
              .select('autograph_id')
              .eq('user_id', user.id),
          ]);
          setIsBlockedProfile(!!blockedRow);
          setSavedCreator(!!savedRow);
          setWatchedIds(new Set((watchRows ?? []).map((r: { autograph_id: string }) => r.autograph_id)));
          void logInterestEvent('view_profile', { creatorId: id });
        } else {
          setIsBlockedProfile(false);
          setSavedCreator(false);
        }

        setProfile(profileData);
      });
  }, [id, user?.id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BrandColors.primary} />
      </View>
    );
  }

  if (notFound || !profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Profile Not Found</Text>
      </View>
    );
  }

  const s = profile.stats;
  const publicVideos = (profile.public_videos ?? profile.active_listings ?? []).filter(canBuyPrint);
  const visiblePublicVideos = publicVideos.slice(0, visibleListingsCount);
  const hasMoreVisibleListings = visiblePublicVideos.length < publicVideos.length;
  const profileStatusLabel = getAccountStatusLabel(profile);

  return (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerTapArea} onPress={() => setDetailsVisible(true)}>
          <View style={styles.avatarColumn}>
            <ProfileAvatar
              name={profile.display_name}
              uri={profile.avatar_url}
              videoUrl={profile.avatar_autograph?.video_url}
              strokes={profile.avatar_autograph?.strokes_json ?? []}
              captureWidth={profile.avatar_autograph?.capture_width ?? 1}
              captureHeight={profile.avatar_autograph?.capture_height ?? 1}
              strokeColor={profile.avatar_autograph?.stroke_color}
              size={72}
            />
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.displayName, { flex: 1 }]}>{profile.display_name}</Text>
            </View>
            {profile.bio ? (
              <Text style={styles.profileBio}>{profile.bio}</Text>
            ) : null}
            {!isOwnProfile && (
              <Pressable onPress={handleToggleSavedCreator} style={[styles.saveCreatorButton, { marginTop: 6, alignSelf: 'flex-start' }]} disabled={savingCreator}>
                <Text style={styles.saveCreatorButtonText}>{savedCreator ? 'Unsave Creator' : 'Save Creator'}</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      {isOwnProfile && (
          <Pressable onPress={() => router.push('/account')} hitSlop={10}>
            <FontAwesome name="cog" size={33} color="#777" />
          </Pressable>
        )}
        {!isOwnProfile && (
          <Pressable onPress={() => setProfileMenuVisible(true)} hitSlop={10} style={styles.profileReportAction}>
            <FontAwesome name="exclamation-circle" size={20} color="#777" />
          </Pressable>
        )}
      </View>


      {isBlockedProfile ? (
        <View style={styles.blockedStateCard}>
          <Text style={styles.blockedStateTitle}>Prints Hidden</Text>
          <Text style={styles.blockedStateText}>
            You have blocked this user. Their public prints and interactions are hidden until you unblock them.
          </Text>
        </View>
      ) : publicVideos.length > 0 ? (
        <View style={styles.listingsGrid}>
          {publicVideos.length > 1 ? (
            <View style={styles.multiPrintToolbar}>
              <Text style={styles.multiPrintToolbarText}>
                {multiPrintMode
                  ? `${selectedPrintIds.length}/5 selected`
                  : `${publicVideos.length} moment${publicVideos.length !== 1 ? 's' : ''}`}
              </Text>
              <View style={styles.multiPrintToolbarActions}>
                {multiPrintMode ? (
                  <Pressable style={styles.multiPrintSecondaryButton} onPress={closeMultiPrintMode}>
                    <Text style={styles.multiPrintSecondaryButtonText}>Cancel</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[
                    styles.multiPrintPrimaryButton,
                    multiPrintMode && selectedPrintIds.length === 0 && styles.multiPrintButtonDisabled,
                  ]}
                  onPress={() => {
                    if (multiPrintMode) {
                      void openSelectedPrintPreview();
                    } else {
                      setMultiPrintMode(true);
                    }
                  }}
                  disabled={multiPrintMode && selectedPrintIds.length === 0}
                >
                  <Text style={styles.multiPrintPrimaryButtonText}>
                    {multiPrintMode ? `Print ${selectedPrintIds.length}` : 'Print Multiple'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {visiblePublicVideos.reduce<Listing[][]>((rows, item, i) => {
            if (i % 2 === 0) rows.push([item]);
            else rows[rows.length - 1].push(item);
            return rows;
          }, []).map((row, rowIndex) => (
            <View key={rowIndex} style={styles.listingsGridRow}>
              {row.map((listing) => (
                <Pressable
                  key={listing.id}
                  style={styles.profileListingCard}
                  onPress={() => {
                    if (multiPrintMode) toggleSelectedPrint(listing);
                    else openPreview(listing);
                  }}
                >
                  <View style={styles.profileListingThumbWrap}>
                    {listing.thumbnail_url || listing.preview_frame_urls?.length || listing.video_url ? (
                      <PublicVideoThumbnail
                        thumbnailUrl={listing.thumbnail_url}
                        videoUrl={listing.video_url}
                        previewFrameUrls={listing.preview_frame_urls ?? []}
                        previewFrameTimesMs={listing.preview_frame_times_ms ?? []}
                        strokes={listing.strokes_json ?? []}
                        captureWidth={listing.capture_width ?? 1}
                        captureHeight={listing.capture_height ?? 1}
                        strokeColor={listing.stroke_color}
                        shellStyle={styles.profileListingThumbnail}
                        mode="flipbook-once"
                        showPlayOverlay
                        playOverlayTiming="after-playback"
                      />
                    ) : (
                      <View style={styles.thumbnailFallback}>
                        <Text style={styles.thumbnailFallbackText}>Ophinia</Text>
                      </View>
                    )}
                    {multiPrintMode ? (
                      <View style={[styles.multiPrintCheck, selectedPrintIds.includes(listing.id) && styles.multiPrintCheckSelected]}>
                        {selectedPrintIds.includes(listing.id) ? (
                          <FontAwesome name="check" size={14} color="#fff" />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.profileListingBody}>
                    <View style={styles.profileListingBodyBottom}>
                      <View style={styles.profileListingMetaColumn}>
                        <CardMetadataBlock
                          compact
                          sequenceNumber={listing.creator_sequence_number}
                          capturedAt={listing.created_at}
                          printCount={listing.print_count ?? null}
                          seriesName={listing.series_name}
                          seriesEdition={
                            listing.series_sequence_number != null && listing.series_max_size != null
                              ? `${listing.series_sequence_number} of ${listing.series_max_size}`
                              : null
                          }
                        />
                      </View>
                    </View>
                      {canBuyPrint(listing) && (
                        <View style={styles.profileListingActionRow}>
                          <Pressable
                            style={[
                              styles.profileCardBuyButton,
                              loadingPrintPreview && { opacity: 0.6 },
                              multiPrintMode && selectedPrintIds.includes(listing.id) && styles.profileCardSelectedButton,
                            ]}
                            onPress={(e) => {
                              e.stopPropagation();
                              if (multiPrintMode) toggleSelectedPrint(listing);
                              else void openPrintPreview(listing);
                            }}
                            disabled={loadingPrintPreview}
                          >
                            <Text style={styles.profileCardBuyButtonText}>
                              {multiPrintMode ? (selectedPrintIds.includes(listing.id) ? 'Selected' : 'Select') : 'Print Preview'}
                            </Text>
                          </Pressable>
                        </View>
                      )}
                  </View>
                </Pressable>
              ))}
              {row.length === 1 ? <View style={styles.profileListingCardPlaceholder} /> : null}
            </View>
          ))}
          {hasMoreVisibleListings ? (
            <Pressable
              style={styles.loadMoreListingsButton}
              onPress={() => setVisibleListingsCount((count) => count + PROFILE_LISTINGS_PAGE_SIZE)}
            >
              <Text style={styles.loadMoreListingsButtonText}>Load More Prints</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.emptyStateText}>No moments yet</Text>
      )}

      <Modal
        visible={detailsVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setDetailsVisible(false)}
      >
        <Pressable style={styles.detailsOverlay} onPress={() => setDetailsVisible(false)}>
          <View style={styles.detailsSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.detailsHeader}>
              <ProfileAvatar
                name={profile.display_name}
                uri={profile.avatar_url}
                videoUrl={profile.avatar_autograph?.video_url}
                strokes={profile.avatar_autograph?.strokes_json ?? []}
                captureWidth={profile.avatar_autograph?.capture_width ?? 1}
                captureHeight={profile.avatar_autograph?.capture_height ?? 1}
                strokeColor={profile.avatar_autograph?.stroke_color}
                size={52}
              />
              <View style={styles.detailsHeaderCopy}>
                <Text style={styles.detailsName}>{profile.display_name}</Text>
                <Text style={styles.detailsTitle}>Profile Details</Text>
              </View>
            </View>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsLabel}>User Status</Text>
              <Text style={styles.detailsValue}>{profileStatusLabel}</Text>
            </View>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsLabel}>Creator Since</Text>
              <Text style={styles.detailsValue}>{formatNumericDate(profile.creator_since)}</Text>
            </View>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsLabel}>Total Autographs Created</Text>
              <Text style={styles.detailsValue}>{s.autographs_signed.toLocaleString()}</Text>
            </View>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsLabel}>Total Series Created</Text>
              <Text style={styles.detailsValue}>{s.unique_series_signed.toLocaleString()}</Text>
            </View>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsLabel}>Member Since</Text>
              <Text style={styles.detailsValue}>{formatNumericDate(profile.member_since)}</Text>
            </View>
            <Pressable style={styles.detailsDoneButton} onPress={() => setDetailsVisible(false)}>
              <Text style={styles.detailsDoneText}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={!!previewItem}
        animationType="none"
        transparent={false}
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={() => setPreviewItem(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalTopRow}>
            <Pressable style={styles.closeButton} onPress={() => { setContextMenuVisible(false); setPreviewItem(null); }}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>

          {previewItem && (previewItem.video_url || previewItem.thumbnail_url || previewItem.preview_frame_urls?.length) ? (
            <>
              <AutographPlayer
                videoUrl={previewItem.video_url}
                thumbnailUrl={previewItem.thumbnail_url}
                previewFrameUrls={previewItem.preview_frame_urls ?? []}
                previewFrameTimesMs={previewItem.preview_frame_times_ms ?? []}
                templateId={previewItem.template_id}
                strokes={previewItem.strokes_json ?? []}
                strokeColor={previewItem.stroke_color}
                captureWidth={previewItem.capture_width ?? 1}
                captureHeight={previewItem.capture_height ?? 1}
                onLongPress={() => setContextMenuVisible(true)}
              />
              <View style={styles.modalMetadataBlock}>
                <Text style={[styles.modalMetaLine, styles.modalMetaCentered]}>
                  {[
                    previewItem.creator_sequence_number != null ? `#${previewItem.creator_sequence_number}` : null,
                    formatNumericDate(previewItem.created_at),
                  ].filter(Boolean).join(' · ')}
                </Text>
                {previewItem.series_name || (previewItem.series_sequence_number != null && previewItem.series_max_size != null) ? (
                  <Text style={[styles.modalMetaLine, styles.modalMetaCentered]} numberOfLines={1}>
                    {[
                      previewItem.series_name,
                      previewItem.series_sequence_number != null && previewItem.series_max_size != null
                        ? `${previewItem.series_sequence_number} of ${previewItem.series_max_size}`
                        : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                <View style={styles.modalUtilityRow}>
                  {!isOwnProfile && (
                    <Pressable
                      style={[styles.modalUtilityButton, watchedIds.has(previewItem.id) && styles.modalUtilityButtonSaved]}
                      onPress={() => { void toggleWatch(previewItem); }}
                    >
                      <Text style={styles.modalUtilityButtonText}>
                        {watchedIds.has(previewItem.id) ? 'Saved' : 'Save Moment'}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.modalUtilityButton} onPress={() => { void openPrintPreview(previewItem); }}>
                    <Text style={styles.modalUtilityButtonText}>Print Preview</Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}

          {contextMenuVisible && previewItem && (
            <Pressable style={styles.contextOverlay} onPress={() => setContextMenuVisible(false)}>
              <View style={styles.contextMenu} onStartShouldSetResponder={() => true}>
                <Text style={styles.contextMenuTitle}>{previewItem.creator_name}</Text>

                <Pressable
                  style={styles.contextMenuItem}
                  onPress={() => {
                    setContextMenuVisible(false);
                    handleShare(previewItem);
                  }}
                >
                  <Text style={styles.contextMenuItemText}>Share</Text>
                </Pressable>


                <Pressable
                  style={styles.contextMenuItem}
                  onPress={() => {
                    setContextMenuVisible(false);
                    setCertItem(previewItem);
                  }}
                >
                  <Text style={styles.contextMenuItemText}>Certificate of Authenticity</Text>
                </Pressable>

                <Pressable
                  style={styles.contextMenuItem}
                  onPress={() => {
                    setContextMenuVisible(false);
                    const targetId = previewItem.creator_id ?? id;
                    setPreviewItem(null);
                    router.push(`/profile/${targetId}`);
                  }}
                >
                  <Text style={styles.contextMenuItemText}>Creator Profile</Text>
                </Pressable>

                {!isOwnProfile && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => {
                      setContextMenuVisible(false);
                      void handleToggleBlockedProfile(!isBlockedProfile);
                    }}
                    disabled={blockingProfile}
                  >
                    <Text style={[styles.contextMenuItemText, { color: '#FF3B30' }]}>
                      {isBlockedProfile ? 'Unblock User' : 'Block User'}
                    </Text>
                  </Pressable>
                )}

                {!isOwnProfile && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => { setContextMenuVisible(false); setReportItem(previewItem); }}
                  >
                    <Text style={[styles.contextMenuItemText, { color: '#FF3B30' }]}>Report</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          )}

          {reportItem && (
            <Pressable style={styles.contextOverlay} onPress={() => setReportItem(null)}>
              <View style={styles.contextMenu} onStartShouldSetResponder={() => true}>
                <Text style={styles.contextMenuTitle}>Report Autograph</Text>
                {[
                  { reason: 'impersonation', label: 'Impersonation' },
                  { reason: 'offensive_content', label: 'Offensive Content' },
                  { reason: 'fraudulent_listing', label: 'Fraud or Scam' },
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

          {certItem && (
            <CertificateSheet
              signedBy={certItem.creator_name}
              currentOwner={certItem.owner_name ?? null}
              dateCaptured={formatPublicVideoDate(certItem.created_at)}
              edition={certItem.series_name && certItem.series_sequence_number != null && certItem.series_max_size != null
                ? `${certItem.series_name} — #${certItem.series_sequence_number} of ${certItem.series_max_size}`
                : null}
              certificateId={certItem.certificate_id}
              primaryActionLabel="Creator Profile"
              onPrimaryAction={() => {
                const targetId = certItem.creator_id ?? id;
                setCertItem(null);
                setPreviewItem(null);
                router.push(`/profile/${targetId}`);
              }}
              onClose={() => setCertItem(null)}
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={personalizedVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (!personalizedSubmitting) setPersonalizedVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.offerOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={24}
        >
          <ScrollView
            contentContainerStyle={styles.offerScrollContent}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.offerSheet}>
              <Text style={styles.offerTitle}>Request Personalized Print</Text>
              <Text style={styles.offerSubtitle}>
                {profile.display_name}
                {' · '}{formatPublicVideoPrice(Math.max(profile.personalized_min_price_cents ?? 0, PERSONALIZED_REQUEST_MIN_CENTS))}
              </Text>
              <TextInput
                style={styles.offerInput}
                placeholder="Recipient name"
                placeholderTextColor="#999"
                value={personalizedRecipient}
                onChangeText={setPersonalizedRecipient}
                maxLength={26}
                inputAccessoryViewID={PERSONALIZED_REQUEST_ACCESSORY_ID}
                editable={!personalizedSubmitting}
              />
              <TextInput
                style={[styles.offerInput, styles.offerNoteInput]}
                placeholder="Optional inscription"
                placeholderTextColor="#999"
                value={personalizedInscription}
                onChangeText={setPersonalizedInscription}
                maxLength={100}
                inputAccessoryViewID={PERSONALIZED_REQUEST_ACCESSORY_ID}
                editable={!personalizedSubmitting}
                multiline
              />
              <TextInput
                style={styles.offerInput}
                placeholder="Optional note to creator"
                placeholderTextColor="#999"
                value={personalizedNote}
                onChangeText={setPersonalizedNote}
                maxLength={26}
                inputAccessoryViewID={PERSONALIZED_REQUEST_ACCESSORY_ID}
                editable={!personalizedSubmitting}
              />
              <Pressable
                style={[styles.offerButton, personalizedSubmitting && { opacity: 0.6 }]}
                onPress={handlePersonalizedSubmitPress}
                disabled={personalizedSubmitting}
              >
                <Text style={styles.offerButtonText}>
                  {personalizedSubmitting
                    ? 'Sending…'
                    : `Send Request · ${formatPublicVideoPrice(Math.max(profile.personalized_min_price_cents ?? 0, PERSONALIZED_REQUEST_MIN_CENTS))}`}
                </Text>
              </Pressable>
              <Pressable
                style={styles.offerCancelButton}
                onPress={() => {
                  if (!personalizedSubmitting) setPersonalizedVisible(false);
                }}
                disabled={personalizedSubmitting}
              >
                <Text style={styles.offerCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={PERSONALIZED_REQUEST_ACCESSORY_ID}>
          <View style={styles.personalizedKeyboardAccessory}>
            <Pressable
              style={[styles.personalizedKeyboardSubmitButton, personalizedSubmitting && { opacity: 0.6 }]}
              onPress={handlePersonalizedSubmitPress}
              disabled={personalizedSubmitting}
            >
              <Text style={styles.personalizedKeyboardSubmitText}>
                {personalizedSubmitting ? 'Sending...' : 'Send Request'}
              </Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}

      <AutographPrintModal
        visible={!!printItem}
        printItem={printItem ? {
          creatorName: printItem.creator_name,
          creatorSequenceNumber: printItem.creator_sequence_number ?? null,
          createdAt: printItem.created_at,
          seriesName: printItem.series_name ?? null,
          printPreviewUrl: printItem.print_preview_url ?? printItem.print_layout_url ?? null,
          thumbnailUrl: printItem.thumbnail_url,
        } : null}
        printItems={selectedPrintItems.length > 1 ? selectedPrintItems.map((item) => ({
          creatorName: item.creator_name,
          creatorSequenceNumber: item.creator_sequence_number ?? null,
          createdAt: item.created_at,
          seriesName: item.series_name ?? null,
          printPreviewUrl: item.print_preview_url ?? item.print_layout_url ?? null,
          thumbnailUrl: item.thumbnail_url,
        })) : undefined}
        printPreview={printPreview}
        printStep={printStep}
        addressSheetVisible={addressSheetVisible}
        creatingPrint={creatingPrint}
        loadingPrintPreview={loadingPrintPreview}
        quantity={printQuantity}
        unitPriceCents={printPreview?.item_cents ?? 1000}
        originalPriceCents={printPreview?.original_price_cents ?? 1000}
        shippingCents={printPreview?.shipping_cents ?? 699}
        onQuantityChange={setPrintQuantity}
        onClose={closePrintPreview}
        onProceedToPayment={handleProceedToPrintPayment}
        onAddressSubmit={handlePrintAddressSubmit}
        onAddressError={() => setAddressSheetVisible(false)}
        formatCardDate={(value) => {
          const d = new Date(value);
          return Number.isNaN(d.getTime()) ? value : `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
        }}
      />
    </ScrollView>

      {creatorSavedNoticeVisible ? (
        <View pointerEvents="none" style={styles.creatorSavedNotice}>
          <Text style={styles.creatorSavedNoticeText}>Creator Saved</Text>
        </View>
      ) : null}

      {profileMenuVisible && (
        <Pressable style={styles.contextOverlay} onPress={() => setProfileMenuVisible(false)}>
          <View style={styles.contextMenu} onStartShouldSetResponder={() => true}>
            <Text style={styles.contextMenuTitle}>{profile?.display_name ?? 'User'}</Text>
            {isBlockedProfile ? (
              <Pressable
                style={styles.contextMenuItem}
                onPress={() => { setProfileMenuVisible(false); void handleToggleBlockedProfile(false); }}
                disabled={blockingProfile}
              >
                <Text style={[styles.contextMenuItemText, { color: '#FF3B30' }]}>
                  {blockingProfile ? 'Updating…' : 'Unblock User'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.contextMenuItem}
                onPress={() => { setProfileMenuVisible(false); setReportProfileVisible(true); }}
              >
                <Text style={[styles.contextMenuItemText, { color: '#FF3B30' }]}>Report & Block User</Text>
              </Pressable>
            )}
            <Pressable style={styles.contextMenuItem} onPress={() => setProfileMenuVisible(false)}>
              <Text style={[styles.contextMenuItemText, { color: '#888' }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      )}

      {reportProfileVisible && (
        <Pressable style={styles.contextOverlay} onPress={() => setReportProfileVisible(false)}>
          <View style={styles.contextMenu} onStartShouldSetResponder={() => true}>
            <Text style={styles.contextMenuTitle}>Why are you reporting this user?</Text>
            {[
              { reason: 'impersonation', label: 'Impersonation' },
              { reason: 'offensive_content', label: 'Offensive Content' },
              { reason: 'harassment_abuse', label: 'Harassment or Abuse' },
              { reason: 'fraudulent_listing', label: 'Scam or Fraud' },
              { reason: 'copyright_issue', label: 'Copyright / IP Issue' },
            ].map(({ reason, label }) => (
              <Pressable
                key={reason}
                style={styles.contextMenuItem}
                onPress={() => handleReportAndBlock(reason)}
                disabled={reportSubmitting}
              >
                <Text style={styles.contextMenuItemText}>{label}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.contextMenuItem} onPress={() => setReportProfileVisible(false)}>
              <Text style={[styles.contextMenuItemText, { color: '#888' }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BrandColors.background,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    fontFamily: BrandFonts.primary,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: BrandColors.background,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 12,
  },
  headerTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatarColumn: {
    alignItems: 'center',
    width: 72,
  },
  headerInfo: {
    flex: 1,
    paddingTop: 4,
  },
  profileHeaderActions: {
    minHeight: 126,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
    paddingBottom: 10,
  },
  profileReportAction: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  profileSaveAction: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  saveCreatorRow: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  saveCreatorButton: {
    borderWidth: 1,
    borderColor: BrandColors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  saveCreatorButtonText: {
    color: BrandColors.primary,
    fontSize: 13,
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
  },
  creatorSavedNotice: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
    backgroundColor: BrandColors.primary,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  creatorSavedNoticeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 1,
  },
  displayName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  verifiedBadge: {
    marginTop: 6,
  },
  verifiedBadgeText: {
    color: '#777',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
    textAlign: 'center',
  },
  memberSince: {
    fontSize: 13,
    color: '#888',
    fontFamily: BrandFonts.primary,
  },
  profileBio: {
    fontSize: 13,
    color: '#555',
    fontFamily: BrandFonts.primary,
    marginTop: 4,
    lineHeight: 18,
  },
  accountLink: {
    backgroundColor: BrandColors.background,
    borderRadius: 999,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  detailsSheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
  },
  detailsHeaderCopy: {
    flex: 1,
  },
  detailsName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  detailsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    fontFamily: BrandFonts.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  detailsLabel: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  detailsValue: {
    maxWidth: '52%',
    fontSize: 14,
    color: '#111',
    fontWeight: '600',
    textAlign: 'right',
    fontFamily: BrandFonts.primary,
  },
  detailsDoneButton: {
    marginTop: 18,
    backgroundColor: '#111',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  detailsDoneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 0,
    fontFamily: BrandFonts.primary,
  },
  blockedStateCard: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F7F7F7',
    borderWidth: 1,
    borderColor: '#E6E6E6',
  },
  blockedStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
    fontFamily: BrandFonts.primary,
  },
  blockedStateText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
    fontFamily: BrandFonts.primary,
  },
  profileCardWrap: {
    flexShrink: 0,
    marginRight: 14,
    marginBottom: 14,
  },
  listingsRail: {
    paddingRight: 24,
  },
  profileListingCard: {
    flex: 1,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  profileListingThumbWrap: {
    backgroundColor: '#050505',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderBottomWidth: 0,
  },
  profileListingThumbnail: {
    width: '100%',
    aspectRatio: 60 / 100,
    height: undefined,
    borderRadius: 0,
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
  listingsGrid: {
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  multiPrintToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  multiPrintToolbarText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  multiPrintToolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  multiPrintPrimaryButton: {
    backgroundColor: BrandColors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  multiPrintPrimaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  multiPrintSecondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D6D6D6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  multiPrintSecondaryButtonText: {
    color: '#555',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  multiPrintButtonDisabled: {
    opacity: 0.45,
  },
  listingsGridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  profileListingCardPlaceholder: {
    flex: 1,
  },
  loadMoreListingsButton: {
    marginTop: 14,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d9cfbe',
    backgroundColor: '#fff',
  },
  loadMoreListingsButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  profileListingBody: {
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 8,
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  profileListingBodyBottom: {
    marginTop: 2,
  },
  profileListingMetaColumn: {
    minWidth: 0,
  },
  profileListingActionRow: {
    marginTop: 7,
    width: '100%',
  },
  profileCardBuyButton: {
    backgroundColor: BrandColors.primary,
    borderRadius: 999,
    width: '100%',
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  profileCardBuyButtonText: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
    textAlign: 'center',
  },
  profileCardSelectedButton: {
    backgroundColor: '#17427D',
  },
  multiPrintCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiPrintCheckSelected: {
    backgroundColor: BrandColors.primary,
  },
  profileListingName: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  profileListingSeriesSlot: {
    minHeight: 18,
    marginTop: 3,
  },
  profileListingSeries: {
    fontSize: 14,
    lineHeight: 15,
    fontFamily: BrandFonts.primary,
    fontStyle: 'italic',
  },
  profileListingSeriesName: {
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  profileListingSeriesEdition: {
    color: '#888',
    fontFamily: BrandFonts.primary,
    fontStyle: 'normal',
  },
  profileListingBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  profileListingVerifiedBadge: {
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
  profileListingGoldBadge: {
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
  profileListingPriceRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  profileListingPrice: {
    fontSize: 23,
    lineHeight: 27,
    fontWeight: '800',
    color: '#111',
    fontFamily: BrandFonts.primary,
    flex: 1,
  },
  profileListingActionButton: {
    backgroundColor: '#111',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  profileListingActionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  thumbnailFallbackText: {
    color: BrandColors.primary,
    fontSize: 28,
    fontFamily: BrandFonts.script,
  },
  editButton: {
    marginTop: -15,
    marginBottom: 12,
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 4,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  editButtonText: {
    color: BrandColors.primary,
    fontSize: 50,
    lineHeight: 64,
    paddingRight: 8,
    fontFamily: BrandFonts.script,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalTopRow: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  closeButtonText: {
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
    fontSize: 16,
  },
  modalMetaText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: BrandFonts.primary,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  modalMetaTextInner: {
    color: '#fff',
    fontSize: 14,
    fontFamily: BrandFonts.primary,
  },
  modalNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  modalNameText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalMetaCentered: {
    textAlign: 'center',
    width: '100%',
  },
  modalMetaLine: {
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: BrandFonts.primary,
    fontWeight: '500',
    textAlign: 'center',
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
  modalUtilityRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  modalUtilityButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  modalUtilityButtonSaved: {
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  modalUtilityButtonText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
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
  personalizedCard: {
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: BrandColors.primary,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BrandColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalizedButtonText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
    textAlign: 'center',
  },
  personalizedUnavailableCard: {
    marginTop: 4,
    marginBottom: 18,
    backgroundColor: '#fff1f0',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f7c8c5',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  personalizedEyebrow: {
    fontSize: 12,
    color: BrandColors.primary,
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  personalizedTitle: {
    marginTop: 6,
    fontSize: 18,
    color: '#111',
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  personalizedBody: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#555',
    fontFamily: BrandFonts.primary,
  },
  offerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 20,
    justifyContent: 'center',
    paddingTop: 36,
    paddingBottom: 32,
  },
  offerScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  offerSheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  offerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  offerSubtitle: {
    marginTop: 8,
    fontSize: 13,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  offerInput: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  offerNoteInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  offerButton: {
    marginTop: 16,
    backgroundColor: BrandColors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  offerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  personalizedKeyboardAccessory: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d8d8d8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  personalizedKeyboardSubmitButton: {
    backgroundColor: BrandColors.primary,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  personalizedKeyboardSubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  offerCancelButton: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  offerCancelText: {
    color: '#666',
    fontSize: 15,
    fontFamily: BrandFonts.primary,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#777',
    fontFamily: BrandFonts.primary,
    marginTop: 4,
    marginBottom: 8,
  },
  verificationCard: {
    width: '100%',
    marginTop: 6,
    marginBottom: 2,
    borderRadius: 16,
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  verificationCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  verificationRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E6',
  },
  verificationCheck: {
    fontSize: 14,
    color: '#0F8A4B',
    fontWeight: '800',
    fontFamily: BrandFonts.primary,
    marginTop: 1,
  },
  verificationCopy: {
    flex: 1,
  },
  verificationLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    marginBottom: 2,
  },
  verificationDetail: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
    fontFamily: BrandFonts.primary,
  },
});

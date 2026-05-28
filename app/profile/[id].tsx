import { AutographPlayer } from '@/components/autograph-player';
import { CardMetadataBlock } from '@/components/card-metadata-block';
import { CertificateSheet } from '@/components/certificate-sheet';
import { ProfileAvatar } from '@/components/profile-avatar';
import { NameWithSequence, formatPublicVideoDate, formatPublicVideoPrice } from '@/components/public-video-card';
import { PublicVideoThumbnail } from '@/components/public-video-thumbnail';
import { BrandColors, BrandFonts } from '@/constants/theme';
import { fetchAutographTemplateIds } from '@/lib/autograph-template';
import { useAuth } from '@/lib/auth-context';
import { callEdgeFunction } from '@/lib/api';
import { logInterestEvent } from '@/lib/interest';
import { buildAutographUrl } from '@/lib/public-links';
import { supabase } from '@/lib/supabase';
import { openAuthenticatedWebPath } from '@/lib/web-handoff';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useStripe } from '@stripe/stripe-react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
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
  video_url?: string | null;
  preview_frame_urls?: string[] | null;
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
  instagram_handle?: string | null;
  instagram_status?: 'none' | 'connected' | 'verified';
  instagram_verified_at?: string | null;
  personalized_requests_enabled?: boolean;
  personalized_min_price_cents?: number | null;
  stats: Stats;
  public_videos?: Listing[];
  active_listings?: Listing[];
};


function formatDetailDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

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

function formatVerificationState(value?: ProfileData['verification_status']) {
  switch (value) {
    case 'verified': return 'Verified';
    case 'pending': return 'Pending Review';
    case 'failed': return 'Verification Failed';
    case 'expired': return 'Expired';
    case 'none':
    default:
      return 'Not Started';
  }
}

function formatInstagramStatus(value?: ProfileData['instagram_status'], handle?: string | null) {
  if (value === 'connected' || value === 'verified') return 'Connected';
  return handle ? 'Connected' : 'Not Linked';
}

function getListingPriceLabel(listing: Pick<Listing, 'listing_mode'>) {
  return listing.listing_mode === 'buy_now' ? 'Fixed Price' : 'Estimated Value';
}

function canBuyNow(listing: Pick<Listing, 'sale_state' | 'listing_mode' | 'offer_locked_until'>) {
  return listing.sale_state === 'fixed' && listing.listing_mode === 'buy_now' && !listing.offer_locked_until;
}

function canMakeOffer(listing: Pick<Listing, 'sale_state' | 'listing_mode' | 'offer_locked_until'>) {
  return listing.sale_state === 'fixed' && listing.listing_mode === 'make_offer' && !listing.offer_locked_until;
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
  const [certItem, setCertItem] = useState<Listing | null>(null);
  const [offerItem, setOfferItem] = useState<Listing | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [offerInput, setOfferInput] = useState('');
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [personalizedVisible, setPersonalizedVisible] = useState(false);
  const [personalizedRecipient, setPersonalizedRecipient] = useState('');
  const [personalizedInscription, setPersonalizedInscription] = useState('');
  const [personalizedNote, setPersonalizedNote] = useState('');
  const [personalizedAmount, setPersonalizedAmount] = useState('');
  const [personalizedSubmitting, setPersonalizedSubmitting] = useState(false);
  const [reportItem, setReportItem] = useState<Listing | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [isBlockedProfile, setIsBlockedProfile] = useState(false);
  const [blockingProfile, setBlockingProfile] = useState(false);
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

  const handleShare = async (item: Listing) => {
    try {
      await Share.share({
        message: `${item.creator_name} on Ophinia\n${buildAutographUrl(item.id)}`,
        url: buildAutographUrl(item.id),
      });
    } catch {}
  };

  const formatCentsInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    const cents = Number.parseInt(digits, 10);
    return (cents / 100).toFixed(2);
  };

  const handleOfferChange = (text: string) => setOfferInput(formatCentsInput(text));
  const handlePersonalizedAmountChange = (text: string) => setPersonalizedAmount(formatCentsInput(text));

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
      setOfferItem(null);
      setOfferInput('');
      Alert.alert('Offer Sent', 'Your offer was sent and the authorization hold is now in place.');
    } catch (error) {
      Alert.alert(
        'Offer Failed',
        error instanceof Error ? error.message : 'Could not create your offer. Please try again.'
      );
    } finally {
      setOfferSubmitting(false);
    }
  };

  const handleBuyNow = async (item: Listing) => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to purchase autographs.');
      return;
    }
    try {
      setPreviewItem(null);
      await openAuthenticatedWebPath(`/app/checkout/${item.id}`);
      Alert.alert('Continue on Web', 'Checkout has been moved to Ophinia on the web.');
    } catch {
      Alert.alert('Error', 'Could not open the web checkout. Please try again.');
    }
  };

  const handleOpenPersonalizedRequest = () => {
    if (!profile) return;
    const minPrice = profile.personalized_min_price_cents
      ? (profile.personalized_min_price_cents / 100).toFixed(2)
      : '10.00';
    setPersonalizedRecipient('');
    setPersonalizedInscription('');
    setPersonalizedNote('');
    setPersonalizedAmount(minPrice);
    setPersonalizedVisible(true);
  };

  const handleCreatePersonalizedRequest = async () => {
    if (!profile) return;
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to request a personalized autograph.');
      return;
    }

    const amount = Number.parseFloat(personalizedAmount);
    const minAmount = (profile.personalized_min_price_cents ?? 0) / 100;

    if (!personalizedRecipient.trim()) {
      Alert.alert('Recipient Required', 'Please enter the recipient name for this personalized autograph.');
      return;
    }

    if (Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid offer amount greater than $0.');
      return;
    }

    if (profile.personalized_min_price_cents && amount < minAmount) {
      Alert.alert('Minimum Price', `This creator requires at least $${minAmount.toFixed(2)} for personalized requests.`);
      return;
    }

    setPersonalizedSubmitting(true);
    try {
      // Disclosure required before collecting payment details.
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Personalized Autograph Request',
          `You are commissioning a personalized autograph from ${profile.display_name} for $${amount.toFixed(2)}. A temporary authorization hold will be placed on your card now. You are only charged when the creator completes and delivers the autograph. Payment is processed by Stripe, Ophinia's authorized payment partner.`,
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
          Alert.alert('Authorization Failed', 'Could not confirm your payment authorization. Please try again.');
        }
        return;
      }

      await callEdgeFunction('create-personalized-autograph-request', {
        creator_id: profile.id,
        recipient_name: personalizedRecipient.trim(),
        inscription_text: personalizedInscription.trim() || null,
        requester_note: personalizedNote.trim() || null,
        amount_cents: Math.round(amount * 100),
        payment_event_id: paymentData.payment_event_id,
      });
      setPersonalizedVisible(false);
      Alert.alert(
        'Request Sent',
        'Your personalized autograph request has been sent and your payment authorization is in place. You can track updates in Personalized Requests from your account.'
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
        Alert.alert('User Blocked', `${profile?.display_name ?? 'This user'} has been blocked. Their listings are now hidden.`);
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

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    supabase.rpc('get_profile_page', { p_user_id: id })
      .then(async ({ data, error }) => {
        setLoading(false);
        if (error || !data) { setNotFound(true); return; }
        const profileData = data as ProfileData;
        const listingIds = [
          ...(profileData.public_videos ?? []).map((item) => item.id),
          ...(profileData.active_listings ?? []).map((item) => item.id),
        ];
        const templateIds = await fetchAutographTemplateIds(listingIds);
        profileData.public_videos = (profileData.public_videos ?? []).map((item) => ({
          ...item,
          template_id: templateIds[item.id] ?? item.template_id ?? 'classic',
        }));
        profileData.active_listings = (profileData.active_listings ?? []).map((item) => ({
          ...item,
          template_id: templateIds[item.id] ?? item.template_id ?? 'classic',
        }));

        if (user?.id && user.id !== id) {
          const { data: blockedRow } = await supabase
            .from('blocked_users')
            .select('blocked_user_id')
            .eq('blocker_id', user.id)
            .eq('blocked_user_id', id)
            .maybeSingle();
          setIsBlockedProfile(!!blockedRow);
          void logInterestEvent('view_profile', { creatorId: id });
        } else {
          setIsBlockedProfile(false);
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
  const publicVideos = profile.public_videos ?? profile.active_listings ?? [];
  const hasCreatedAutographs = s.autographs_signed > 0;
  const profileStatusLabel = hasCreatedAutographs ? 'Creator / Collector' : 'Collector';
  const verificationLabel = profile.role === 'verified' ? 'Verified' : 'Member';

  return (
    <ScrollView contentContainerStyle={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerTapArea} onPress={() => setDetailsVisible(true)}>
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
          <View style={styles.headerInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.displayName, { flex: 1 }]}>{profile.display_name}</Text>
              {profile.verified && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedBadgeText}>✓ Verified</Text>
                </View>
              )}
            </View>
            {profile.verified ? (
              <Text style={styles.memberSince}>✓ Verified by Ophinia</Text>
            ) : null}
            {profile.bio ? (
              <Text style={styles.profileBio}>{profile.bio}</Text>
            ) : null}
          </View>
        </Pressable>
      {isOwnProfile && (
          <Pressable onPress={() => router.push('/account')} hitSlop={10}>
            <FontAwesome name="cog" size={33} color="#777" />
          </Pressable>
        )}
        {!isOwnProfile && (
          <Pressable onPress={() => setProfileMenuVisible(true)} hitSlop={10} style={{ paddingHorizontal: 4 }}>
            <FontAwesome name="ellipsis-v" size={20} color="#777" />
          </Pressable>
        )}
      </View>

      {profileMenuVisible && (
        <Pressable style={styles.contextOverlay} onPress={() => setProfileMenuVisible(false)}>
          <View style={styles.contextMenu} onStartShouldSetResponder={() => true}>
            <Text style={styles.contextMenuTitle}>{profile?.display_name ?? 'User'}</Text>
            <Pressable
              style={styles.contextMenuItem}
              onPress={() => { setProfileMenuVisible(false); void handleToggleBlockedProfile(!isBlockedProfile); }}
              disabled={blockingProfile}
            >
              <Text style={[styles.contextMenuItemText, { color: '#FF3B30' }]}>
                {blockingProfile ? 'Updating…' : isBlockedProfile ? 'Unblock User' : 'Block User'}
              </Text>
            </Pressable>
            <Pressable style={styles.contextMenuItem} onPress={() => setProfileMenuVisible(false)}>
              <Text style={[styles.contextMenuItemText, { color: '#888' }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      )}

      {!isOwnProfile && !isBlockedProfile && profile.personalized_requests_enabled ? (
        <Pressable style={styles.personalizedCard} onPress={handleOpenPersonalizedRequest}>
          <Text style={styles.personalizedEyebrow}>Personalized Autograph</Text>
          <Text style={styles.personalizedTitle}>Request a custom Ophinia autograph</Text>
          <Text style={styles.personalizedBody}>
            Personalized requests start at {formatPublicVideoPrice(profile.personalized_min_price_cents ?? 1000)}.
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.sectionTitle}>Listings</Text>
      {isBlockedProfile ? (
        <View style={styles.blockedStateCard}>
          <Text style={styles.blockedStateTitle}>Listings Hidden</Text>
          <Text style={styles.blockedStateText}>
            You have blocked this user. Their listings and interactions are hidden until you unblock them.
          </Text>
        </View>
      ) : publicVideos.length > 0 ? (
        <View style={styles.listingsGrid}>
          {publicVideos.reduce<Listing[][]>((rows, item, i) => {
            if (i % 2 === 0) rows.push([item]);
            else rows[rows.length - 1].push(item);
            return rows;
          }, []).map((row, rowIndex) => (
            <View key={rowIndex} style={styles.listingsGridRow}>
              {row.map((listing) => (
                <Pressable key={listing.id} style={styles.profileListingCard} onPress={() => openPreview(listing)}>
                  <View style={styles.profileListingThumbWrap}>
                    {listing.thumbnail_url || listing.preview_frame_urls?.length || listing.video_url ? (
                      <PublicVideoThumbnail
                        thumbnailUrl={listing.thumbnail_url}
                        videoUrl={listing.video_url}
                        previewFrameUrls={listing.preview_frame_urls ?? []}
                        strokes={listing.strokes_json ?? []}
                        captureWidth={listing.capture_width ?? 1}
                        captureHeight={listing.capture_height ?? 1}
                        strokeColor={listing.stroke_color}
                        shellStyle={styles.profileListingThumbnail}
                        mode="flipbook-once"
                      />
                    ) : (
                      <View style={styles.thumbnailFallback}>
                        <Text style={styles.thumbnailFallbackText}>Ophinia</Text>
                      </View>
                    )}
                    {listing.sale_state === 'fixed' && (
                      <View style={styles.cardOverlayBar}>
                        <Text style={styles.cardOverlayPrice} numberOfLines={1}>
                          {listing.offer_locked_until ? 'Sale Pending' : formatPublicVideoPrice(listing.price_cents)}
                        </Text>
                        {!listing.offer_locked_until && !isOwnProfile && canBuyNow(listing) ? (
                          <Pressable
                            style={styles.cardOverlayButton}
                            onPress={(e) => { e.stopPropagation(); handleBuyNow(listing); }}
                          >
                            <Text style={styles.cardOverlayButtonText}>Buy</Text>
                          </Pressable>
                        ) : !listing.offer_locked_until && !isOwnProfile && canMakeOffer(listing) ? (
                          <Pressable
                            style={styles.cardOverlayButton}
                            onPress={(e) => { e.stopPropagation(); setOfferItem(listing); setOfferInput(''); }}
                          >
                            <Text style={styles.cardOverlayButtonText}>Offer</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )}
                  </View>
                  <View style={styles.profileListingBody}>
                    <NameWithSequence
                      name={listing.creator_name}
                      sequenceNumber={listing.creator_sequence_number}
                      style={styles.profileListingName}
                    />
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
                </Pressable>
              ))}
              {row.length === 1 ? <View style={styles.profileListingCardPlaceholder} /> : null}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyStateText}>No current listings</Text>
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
            <View style={styles.verificationCard}>
              <Text style={styles.verificationCardTitle}>Verification</Text>
              {[
                { label: 'Status', detail: verificationLabel },
                { label: 'Verification State', detail: formatVerificationState(profile.verification_status) },
                ...(profile.first_verified_at ? [{ label: 'First Verified On', detail: formatDetailDate(profile.first_verified_at) }] : []),
              ].map((item, index, arr) => (
                <View key={item.label} style={[styles.verificationRow, index < arr.length - 1 && styles.verificationRowBorder]}>
                  {profile.role === 'verified' || profile.verified ? <Text style={styles.verificationCheck}>✓</Text> : null}
                  <View style={styles.verificationCopy}>
                    <Text style={styles.verificationLabel}>{item.label}</Text>
                    <Text style={styles.verificationDetail}>{item.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsLabel}>Ophinia Status</Text>
              <Text style={styles.detailsValue}>{profileStatusLabel}</Text>
            </View>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsLabel}>Instagram</Text>
              <Text style={styles.detailsValue}>
                {profile.instagram_handle ? `@${profile.instagram_handle}` : '—'}
              </Text>
            </View>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsLabel}>Instagram Status</Text>
              <Text style={styles.detailsValue}>{formatInstagramStatus(profile.instagram_status, profile.instagram_handle)}</Text>
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
              <Text style={styles.detailsLabel}>Total Gold Autographs</Text>
              <Text style={styles.detailsValue}>{s.gold_signed.toLocaleString()}</Text>
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
                templateId={previewItem.template_id}
                strokes={previewItem.strokes_json ?? []}
                strokeColor={previewItem.stroke_color}
                captureWidth={previewItem.capture_width ?? 1}
                captureHeight={previewItem.capture_height ?? 1}
                onLongPress={() => setContextMenuVisible(true)}
              />
              <View style={styles.modalMetadataBlock}>
                <View style={styles.modalHeaderRow}>
                  <View style={styles.modalHeaderMetaLeft}>
                    <Text style={styles.modalHeaderMetaText}>{formatNumericDate(previewItem.created_at)}</Text>
                  </View>
                  <View style={styles.modalNameRow}>
                    <NameWithSequence name={previewItem.creator_name} sequenceNumber={previewItem.creator_sequence_number} style={styles.modalMetaTextInner} />
                    {previewItem.creator_name_verified && (
                      <Image source={require('../../assets/images/Ophinia_badge_navy background.png')} style={styles.nameBadge} resizeMode="contain" />
                    )}
                  </View>
                  <Pressable style={styles.certificateLink} onPress={() => setCertItem(previewItem)}>
                    <Image source={require('../../assets/images/Ophinia_O.png')} style={styles.certificateLogo} resizeMode="contain" />
                  </Pressable>
                </View>
                <View style={styles.modalInfoRow}>
                  <View style={styles.modalInfoLeft}>
                    {previewItem.print_count != null ? (
                      <Text style={styles.modalInfoText}>{`Print #${previewItem.print_count + 1}`}</Text>
                    ) : null}
                  </View>
                  <View style={styles.modalInfoCenter}>
                    {previewItem.series_name || (previewItem.series_sequence_number != null && previewItem.series_max_size != null) ? (
                      <Text style={styles.modalSeriesText} numberOfLines={1}>
                        {previewItem.series_name ?? ''}
                        {previewItem.series_name && previewItem.series_sequence_number != null && previewItem.series_max_size != null ? ' · ' : ''}
                        {previewItem.series_sequence_number != null && previewItem.series_max_size != null
                          ? `${previewItem.series_sequence_number} of ${previewItem.series_max_size}`
                          : ''}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.modalInfoRow}>
                  <View style={styles.modalInfoLeft}>
                    <Text style={styles.modalInfoText}>{`Listed by ${isOwnProfile ? 'You' : (previewItem.owner_name ?? previewItem.creator_name)}`}</Text>
                  </View>
                  <View style={styles.modalInfoCenter} />
                </View>
                <View style={styles.modalUtilityRow}>
                  <Pressable style={styles.modalUtilityButton} onPress={() => { void handleShare(previewItem); }}>
                    <Text style={styles.modalUtilityButtonText}>Share</Text>
                  </Pressable>
                </View>
              </View>
              {!isOwnProfile && (
                <View style={styles.modalActionBar}>
                  <Text style={styles.modalActionPrice}>
                    {previewItem.offer_locked_until
                      ? 'Sale Pending'
                      : previewItem.sale_state === 'fixed'
                        ? formatPublicVideoPrice(previewItem.price_cents)
                        : null}
                  </Text>
                  {!previewItem.offer_locked_until && canBuyNow(previewItem) ? (
                    <Pressable style={styles.modalActionButton} onPress={() => { setPreviewItem(null); handleBuyNow(previewItem); }}>
                      <Text style={styles.modalActionButtonText}>Buy Now</Text>
                    </Pressable>
                  ) : !previewItem.offer_locked_until && canMakeOffer(previewItem) ? (
                    <Pressable style={styles.modalActionButton} onPress={() => { const item = previewItem; setPreviewItem(null); setOfferItem(item); setOfferInput(''); }}>
                      <Text style={styles.modalActionButtonText}>Make Offer</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
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

                {!isOwnProfile && canMakeOffer(previewItem) && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => {
                      const item = previewItem;
                      setContextMenuVisible(false);
                      setPreviewItem(null);
                      setOfferItem(item);
                      setOfferInput('');
                    }}
                  >
                    <Text style={styles.contextMenuItemText}>Make Offer</Text>
                  </Pressable>
                )}

                {!isOwnProfile && canBuyNow(previewItem) && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => {
                      const item = previewItem;
                      setContextMenuVisible(false);
                      handleBuyNow(item);
                    }}
                  >
                    <Text style={styles.contextMenuItemText}>Buy Now · {formatPublicVideoPrice(previewItem.price_cents)}</Text>
                  </Pressable>
                )}

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
        <Pressable
          style={styles.offerOverlay}
          onPress={() => {
            if (!personalizedSubmitting) setPersonalizedVisible(false);
          }}
        >
          <View style={styles.offerSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.offerTitle}>Request Personalized Autograph</Text>
            <Text style={styles.offerSubtitle}>
              {profile.display_name}
              {' · '}Minimum {formatPublicVideoPrice(profile.personalized_min_price_cents ?? 1000)}
            </Text>
            <TextInput
              style={styles.offerInput}
              placeholder="Recipient name"
              placeholderTextColor="#999"
              value={personalizedRecipient}
              onChangeText={setPersonalizedRecipient}
              editable={!personalizedSubmitting}
            />
            <TextInput
              style={styles.offerInput}
              placeholder="Optional inscription"
              placeholderTextColor="#999"
              value={personalizedInscription}
              onChangeText={setPersonalizedInscription}
              editable={!personalizedSubmitting}
            />
            <TextInput
              style={[styles.offerInput, styles.offerNoteInput]}
              placeholder="Optional note to creator"
              placeholderTextColor="#999"
              value={personalizedNote}
              onChangeText={setPersonalizedNote}
              editable={!personalizedSubmitting}
              multiline
            />
            <TextInput
              style={styles.offerInput}
              placeholder="Your offer in USD"
              placeholderTextColor="#999"
              keyboardType="decimal-pad"
              value={personalizedAmount}
              onChangeText={handlePersonalizedAmountChange}
              editable={!personalizedSubmitting}
            />
            <Pressable
              style={[styles.offerButton, personalizedSubmitting && { opacity: 0.6 }]}
              onPress={handleCreatePersonalizedRequest}
              disabled={personalizedSubmitting}
            >
              <Text style={styles.offerButtonText}>
                {personalizedSubmitting ? 'Sending…' : 'Send Request'}
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
        </Pressable>
      </Modal>

      <Modal
        visible={!!offerItem}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { if (!offerSubmitting) { setOfferItem(null); setOfferInput(''); } }}
      >
        <Pressable style={styles.offerOverlay} onPress={() => { if (!offerSubmitting) { setOfferItem(null); setOfferInput(''); } }}>
          <View style={styles.offerSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.offerTitle}>Make Offer</Text>
            <Text style={styles.offerSubtitle}>
              {offerItem?.creator_name ?? 'Autograph'}
              {offerItem?.sale_state === 'fixed' && offerItem.price_cents
                ? ` · ${getListingPriceLabel(offerItem)} ${formatPublicVideoPrice(offerItem.price_cents)}`
                : ''
              }
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
        </Pressable>
      </Modal>
    </ScrollView>
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
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  headerTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerInfo: {
    flex: 1,
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
    backgroundColor: BrandColors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  verifiedBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
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
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  profileListingThumbWrap: {
    backgroundColor: '#050505',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  profileListingThumbnail: {
    width: '100%',
    aspectRatio: 60 / 85,
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
  listingsGridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  profileListingCardPlaceholder: {
    flex: 1,
  },
  profileListingBody: {
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 8,
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
    borderWidth: 1.5,
    borderColor: '#fff',
    borderRadius: 8,
  },
  closeButtonText: {
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
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
    justifyContent: 'center',
    padding: 20,
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
    minHeight: 92,
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
    marginTop: 12,
    marginBottom: 4,
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

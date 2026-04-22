import { AutographPlayer } from '@/components/autograph-player';
import { CertificateSheet } from '@/components/certificate-sheet';
import { ProfileAvatar } from '@/components/profile-avatar';
import { NameWithSequence, PublicVideoCard, formatPublicVideoDate, formatPublicVideoPrice, publicVideoCardStyles } from '@/components/public-video-card';
import { PublicVideoThumbnail } from '@/components/public-video-thumbnail';
import { BrandColors, BrandFonts } from '@/constants/theme';
import { callEdgeFunction } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { logInterestEvent } from '@/lib/interest';
import { supabase } from '@/lib/supabase';
import FontAwesome from '@expo/vector-icons/FontAwesome';
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
  is_for_sale: boolean;
  price_cents: number | null;
  thumbnail_url: string | null;
  video_url?: string | null;
  strokes_json?: Stroke[];
  capture_width?: number;
  capture_height?: number;
  stroke_color: string;
  creator_name: string;
  creator_verified: boolean;
  creator_sequence_number?: number | null;
  series_name?: string | null;
  series_sequence_number?: number | null;
  series_max_size?: number | null;
  owner_name?: string | null;
  offer_locked_until?: string | null;
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
  const [certItem, setCertItem] = useState<Listing | null>(null);
  const [offerItem, setOfferItem] = useState<Listing | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [offerInput, setOfferInput] = useState('');
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [reportItem, setReportItem] = useState<Listing | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const appUrl = process.env.EXPO_PUBLIC_APP_URL ?? 'https://tapnsign.app';
  const isOwnProfile = user?.id === id;

  useEffect(() => {
    navigation.setOptions({
      headerBackVisible: !isOwnProfile,
      headerLeft: isOwnProfile ? () => null : undefined,
      headerRight: undefined,
    });
  }, [isOwnProfile, navigation, router]);

  const openPreview = (item: Listing) => {
    if (item.video_url) {
      setPreviewItem(item);
      void logInterestEvent('view_autograph', {
        autographId: item.id,
        creatorId: item.creator_id ?? id,
      });
    } else {
      Linking.openURL(`${appUrl}/verify/${item.certificate_id}`);
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
        message: `${item.creator_name} on TapnSign\n${appUrl}/verify/${item.certificate_id}`,
        url: `${appUrl}/verify/${item.certificate_id}`,
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
      Alert.alert('Offer Sent', 'Your offer was sent and will expire in 72 hours if it is not answered.');
    } catch {
      Alert.alert('Offer Failed', 'Could not send offer. Please try again.');
    } finally {
      setOfferSubmitting(false);
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
        const publicVideos = profileData.public_videos ?? profileData.active_listings ?? [];
        const videoIds = publicVideos.map((video) => video.id);

        if (videoIds.length > 0) {
          const nowIso = new Date().toISOString();
          const { data: lockedOffers } = await supabase
            .from('autograph_offers')
            .select('autograph_id, payment_due_at')
            .in('autograph_id', videoIds)
            .eq('status', 'accepted')
            .is('accepted_transfer_id', null)
            .gt('payment_due_at', nowIso);

          const lockedMap = new Map<string, string | null>();
          for (const offer of lockedOffers ?? []) {
            lockedMap.set(offer.autograph_id, offer.payment_due_at ?? null);
          }

          const remap = publicVideos.map((video) => (
            lockedMap.has(video.id)
              ? {
                  ...video,
                  sale_state: 'not_for_sale' as const,
                  is_for_sale: false,
                  offer_locked_until: lockedMap.get(video.id) ?? null,
                }
              : video
          ));

          profileData.public_videos = remap;
          profileData.active_listings = remap;
        }

        if (!profileData.avatar_autograph && profileData.profile_avatar_autograph_id) {
          const { data: avatarAutograph } = await supabase
            .from('autographs')
            .select('id, thumbnail_url, video_url, strokes_json, capture_width, capture_height, stroke_color')
            .eq('id', profileData.profile_avatar_autograph_id)
            .eq('status', 'active')
            .maybeSingle();

          if (avatarAutograph) {
            profileData.avatar_autograph = {
              id: avatarAutograph.id,
              thumbnail_url: avatarAutograph.thumbnail_url,
              video_url: avatarAutograph.video_url,
              strokes_json: avatarAutograph.strokes_json ?? [],
              capture_width: avatarAutograph.capture_width ?? 1,
              capture_height: avatarAutograph.capture_height ?? 1,
              stroke_color: avatarAutograph.stroke_color,
            };
            profileData.avatar_url = avatarAutograph.thumbnail_url ?? profileData.avatar_url ?? null;
          }
        }

        if (user?.id && user.id !== id) {
          void logInterestEvent('view_profile', { creatorId: id });
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
              <Text style={styles.displayName}>{profile.display_name}</Text>
              {profile.verified && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedBadgeText}>✓ Verified</Text>
                </View>
              )}
            </View>
            {profile.verified ? (
              <Text style={styles.memberSince}>✓ Verified by TapnSign</Text>
            ) : null}
            {profile.instagram_handle ? (
              <Pressable
                style={styles.instagramLinkRow}
                onPress={() => Linking.openURL(`https://instagram.com/${profile.instagram_handle}`)}
              >
                <FontAwesome name="instagram" size={14} color="#E1306C" />
                <Text style={styles.instagramLinkText}>@{profile.instagram_handle}</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
        {isOwnProfile && (
          <Pressable onPress={() => router.push('/account')} hitSlop={10}>
            <FontAwesome name="cog" size={33} color="#777" />
          </Pressable>
        )}
      </View>


      {/* Public videos */}
      {publicVideos.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Public Videos</Text>
          {publicVideos.map((listing) => (
            <View key={listing.id} style={styles.profileCardWrap}>
              <PublicVideoCard
                name={listing.creator_name}
                sequenceNumber={listing.creator_sequence_number}
                date={formatPublicVideoDate(listing.created_at)}
                verified={listing.creator_verified}
                gold={listing.stroke_color === '#C9A84C'}
                seriesName={listing.series_name}
                seriesEdition={listing.series_sequence_number != null && listing.series_max_size != null ? `${listing.series_sequence_number} of ${listing.series_max_size}` : null}
                priceText={listing.sale_state === 'fixed' ? formatPublicVideoPrice(listing.price_cents) : 'Not for Sale'}
                secondaryText={listing.sale_state === 'fixed' && listing.owner_name ? `Listed by ${listing.owner_name}` : null}
                onPress={() => openPreview(listing)}
                renderThumbnail={() => (
                  listing.video_url ? (
                    <PublicVideoThumbnail
                      videoUrl={listing.video_url}
                      strokes={listing.strokes_json ?? []}
                      captureWidth={listing.capture_width ?? 1}
                      captureHeight={listing.capture_height ?? 1}
                      strokeColor={listing.stroke_color}
                    />
                  ) : (
                    <View style={publicVideoCardStyles.thumbnailShell}>
                      {listing.thumbnail_url ? (
                        <Image source={{ uri: listing.thumbnail_url }} style={styles.thumbnailImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.thumbnailFallback}>
                          <Text style={styles.thumbnailFallbackText}>TapnSign</Text>
                        </View>
                      )}
                    </View>
                  )
                )}
              />
            </View>
          ))}
        </>
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
              <Text style={styles.detailsLabel}>TapnSign Status</Text>
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

          {previewItem?.video_url ? (
            <>
              <AutographPlayer
                videoUrl={previewItem.video_url}
                strokes={previewItem.strokes_json ?? []}
                strokeColor={previewItem.stroke_color}
                captureWidth={previewItem.capture_width ?? 1}
                captureHeight={previewItem.capture_height ?? 1}
                onCertificate={() => setCertItem(previewItem)}
                onLongPress={() => setContextMenuVisible(true)}
              />
              <View style={[styles.modalMetaText, { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }]}>
                <NameWithSequence name={previewItem.creator_name} sequenceNumber={previewItem.creator_sequence_number} style={styles.modalMetaTextInner} />
                {previewItem.series_name ? <Text style={styles.modalMetaTextInner}>{` · ${previewItem.series_name}`}</Text> : null}
                <Text style={styles.modalMetaTextInner}>{` · ${formatPublicVideoDate(previewItem.created_at)}`}</Text>
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

                {!isOwnProfile && previewItem.sale_state === 'not_for_sale' && (
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
        visible={!!offerItem}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { if (!offerSubmitting) { setOfferItem(null); setOfferInput(''); } }}
      >
        <Pressable style={styles.offerOverlay} onPress={() => { if (!offerSubmitting) { setOfferItem(null); setOfferInput(''); } }}>
          <View style={styles.offerSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.offerTitle}>Make Offer</Text>
            <Text style={styles.offerSubtitle}>
              {offerItem?.creator_name ?? 'Autograph'} · Expires in 72 hours if not accepted
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
    padding: 20,
    backgroundColor: BrandColors.background,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
    gap: 16,
  },
  headerTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
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
  instagramLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  instagramLinkText: {
    fontSize: 13,
    color: '#555',
    fontFamily: BrandFonts.primary,
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
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
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
    marginBottom: 14,
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

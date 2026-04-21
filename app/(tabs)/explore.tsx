import { ProfileAvatar } from '@/components/profile-avatar';
import { PublicVideoThumbnail } from '@/components/public-video-thumbnail';
import { BrandColors, BrandFonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { callEdgeFunction } from '@/lib/api';
import { getPushDiagnostics, type PushDiagnostics } from '@/lib/notifications';
import { useStripe } from '@stripe/stripe-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ActivityIndicator, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '@/lib/supabase';

type AvatarAutograph = {
  id: string;
  thumbnail_url: string | null;
  video_url: string | null;
  strokes_json: { id: string; points: { x: number; y: number; t: number }[] }[];
  capture_width: number;
  capture_height: number;
  stroke_color: string | null;
  creator_sequence_number: number | null;
  created_at: string;
};

type VerificationEvent = {
  id: string;
  event_type: 'identity_session_created' | 'identity_verified' | 'identity_failed' | 'identity_requires_input' | 'identity_expired';
  status: 'none' | 'pending' | 'verified' | 'failed' | 'expired';
  provider_payload: {
    last_error?: {
      code?: string | null;
      reason?: string | null;
      type?: string | null;
      message?: string | null;
    } | null;
  } | null;
  created_at: string;
};

function getVerificationFailureExplanation(event: VerificationEvent | null, verificationStatus: string) {
  if (verificationStatus === 'expired') {
    return 'Your verification session ended before it was completed. A new attempt is required to continue.';
  }

  const errorCode = event?.provider_payload?.last_error?.code?.toLowerCase() ?? '';
  const errorReason = event?.provider_payload?.last_error?.reason?.toLowerCase() ?? '';
  const errorMessage = event?.provider_payload?.last_error?.message?.toLowerCase() ?? '';
  const signal = `${errorCode} ${errorReason} ${errorMessage}`;

  if (signal.includes('blur') || signal.includes('unreadable') || signal.includes('low_quality')) {
    return 'We could not read the document clearly from that attempt. This is often caused by blurry photos or unreadable text.';
  }

  if (signal.includes('glare') || signal.includes('shadow') || signal.includes('lighting') || signal.includes('reflection')) {
    return 'The document image may have had glare, reflections, or uneven lighting that made it hard to verify.';
  }

  if (signal.includes('crop') || signal.includes('corner') || signal.includes('cut off')) {
    return 'The document image may have been cropped or missing important edges and details.';
  }

  if (signal.includes('selfie') || signal.includes('face') || signal.includes('liveness')) {
    return 'The identity check could not clearly confirm the selfie or live capture portion of the attempt.';
  }

  if (signal.includes('document') || signal.includes('id')) {
    return 'The document submitted in that attempt could not be verified clearly enough to approve the account.';
  }

  return 'We could not verify your identity from that attempt. This is often caused by photo quality, glare, cropped documents, or unreadable information.';
}

function VerificationPolicyCard() {
  return (
    <View style={styles.verificationCard}>
      <Text style={styles.verificationCardTitle}>Creator Verification</Text>
      <Text style={styles.verificationCardBody}>
        Verified creators are the only users allowed to mint authentic TapnSign autographs.
      </Text>
      <Text style={styles.verificationCardPolicy}>
        Your verification fee covers one identity verification attempt. If the attempt fails, a new payment may be required.
      </Text>
      <Text style={styles.verificationCardNote}>
        If the failure appears to be a simple capture mistake, TapnSign support may be able to help.
      </Text>
    </View>
  );
}

function VerificationGuidance({ compact = false }: { compact?: boolean }) {
  return (
    <View style={compact ? styles.guidanceCompact : styles.guidanceBox}>
      <Text style={styles.guidanceTitle}>Tips For Your Next Attempt</Text>
      <Text style={styles.guidanceItem}>• Use bright, even lighting</Text>
      <Text style={styles.guidanceItem}>• Avoid glare, shadows, and cropped corners</Text>
      <Text style={styles.guidanceItem}>• Make sure all ID text is readable</Text>
      <Text style={styles.guidanceItem}>• Use a supported government-issued ID</Text>
      <Text style={styles.guidanceItem}>• Double-check your account details before you submit</Text>
    </View>
  );
}

export default function AccountScreen() {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [verifying, setVerifying] = useState(false);
  const [sendingTestPush, setSendingTestPush] = useState(false);
  const [instagramHandle, setInstagramHandle] = useState(profile?.instagram_handle ?? '');
  const [savingInstagram, setSavingInstagram] = useState(false);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState<AvatarAutograph[]>([]);
  const [loadingAvatarOptions, setLoadingAvatarOptions] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [pushDiagnostics, setPushDiagnostics] = useState<PushDiagnostics | null>(null);
  const [loadingPushDiagnostics, setLoadingPushDiagnostics] = useState(true);
  const [latestVerificationEvent, setLatestVerificationEvent] = useState<VerificationEvent | null>(null);
  const [courtesyRetryAvailable, setCourtesyRetryAvailable] = useState(false);

  const instagramStatusLabel =
    profile?.instagram_handle ? 'Connected' : 'Not Linked';

  const handleApplyForVerification = async () => {
    if (!user) return;
    setVerifying(true);

    try {
      const paymentData = await callEdgeFunction<{
        courtesy_retry_available?: boolean;
        client_secret?: string;
      }>('create-verification-payment-intent');

      if (paymentData?.courtesy_retry_available) {
        const identityData = await callEdgeFunction<{ url?: string }>('create-identity-session');

        if (!identityData?.url) {
          Alert.alert('Error', 'A courtesy retry was approved, but we could not start identity verification. Contact support.');
          setVerifying(false);
          return;
        }

        await WebBrowser.openBrowserAsync(identityData.url);
        await refreshProfile();
        setCourtesyRetryAvailable(false);
        setVerifying(false);
        return;
      }

      if (!paymentData?.client_secret) {
        Alert.alert('Error', 'Could not start payment. Please try again.');
        setVerifying(false);
        return;
      }

      // Step 2: Present payment sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: paymentData.client_secret,
        merchantDisplayName: 'TapnSign',
      });

      if (initError) {
        Alert.alert('Error', initError.message);
        setVerifying(false);
        return;
      }

      const { error: paymentError } = await presentPaymentSheet();
      if (paymentError) {
        if (paymentError.code !== 'Canceled') {
          Alert.alert('Payment Failed', paymentError.message);
        }
        setVerifying(false);
        return;
      }

      // Step 3: Create identity verification session
      const identityData = await callEdgeFunction<{ url?: string }>('create-identity-session');

      if (!identityData?.url) {
        Alert.alert('Error', 'Payment received but could not start identity check. Contact support.');
        setVerifying(false);
        return;
      }

      // Step 4: Open Stripe Identity in browser
      await WebBrowser.openBrowserAsync(identityData.url);

      // Refresh profile to show pending status
      await refreshProfile();
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }

    setVerifying(false);
  };

  const handleSaveInstagram = async () => {
    if (!user) return;
    setSavingInstagram(true);
    try {
      const handle = instagramHandle.trim().replace(/^@/, '');
      const { error } = await supabase
        .from('profiles')
        .update({
          instagram_handle: handle || null,
          instagram_status: handle ? 'connected' : 'none',
          instagram_verified_at: null,
          instagram_verification_method: null,
        })
        .eq('id', user.id);
      if (error) throw new Error(error.message);
      await refreshProfile();
      Alert.alert('Saved', handle ? `Instagram set to @${handle}` : 'Instagram handle removed.');
    } catch {
      Alert.alert('Error', 'Could not save Instagram handle. Please try again.');
    } finally {
      setSavingInstagram(false);
    }
  };

  const loadAvatarOptions = async () => {
    if (!user) return;
    setLoadingAvatarOptions(true);
    try {
      const { data, error } = await supabase
        .from('autographs')
        .select('id, thumbnail_url, video_url, strokes_json, capture_width, capture_height, stroke_color, creator_sequence_number, created_at')
        .eq('creator_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      setAvatarOptions((data ?? []) as AvatarAutograph[]);
      setAvatarPickerVisible(true);
    } catch {
      Alert.alert('Profile Image', 'Could not load your autographs. Please try again.');
    } finally {
      setLoadingAvatarOptions(false);
    }
  };

  const handleSelectAvatarAutograph = async (autographId: string | null) => {
    setSavingAvatar(true);
    try {
      await callEdgeFunction('set-profile-avatar-autograph', {
        autograph_id: autographId,
      });
      await refreshProfile();
      setAvatarPickerVisible(false);
      Alert.alert('Profile Image Updated', autographId ? 'Your profile image now uses that autograph thumbnail.' : 'Your profile image was cleared.');
    } catch {
      Alert.alert('Profile Image Failed', 'Could not update your profile image. Please try again.');
    } finally {
      setSavingAvatar(false);
    }
  };

  const verificationStatus = profile?.verification_status ?? 'none';
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'missing';
  const projectRef = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co$/)?.[1] ?? 'unknown';

  useEffect(() => {
    setInstagramHandle(profile?.instagram_handle ?? '');
  }, [profile?.instagram_handle]);

  useEffect(() => {
    let alive = true;

    const loadDiagnostics = async () => {
      setLoadingPushDiagnostics(true);
      try {
        const diagnostics = await getPushDiagnostics();
        if (alive) setPushDiagnostics(diagnostics);
      } finally {
        if (alive) setLoadingPushDiagnostics(false);
      }
    };

    loadDiagnostics();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadLatestVerificationEvent = async () => {
      if (!user || (verificationStatus !== 'failed' && verificationStatus !== 'expired')) {
        if (alive) setLatestVerificationEvent(null);
        return;
      }

      const { data, error } = await supabase
        .from('verification_events')
        .select('id, event_type, status, provider_payload, created_at')
        .eq('user_id', user.id)
        .in('status', ['failed', 'expired'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!alive) return;
      if (error) {
        setLatestVerificationEvent(null);
        return;
      }

      setLatestVerificationEvent((data as VerificationEvent | null) ?? null);
    };

    loadLatestVerificationEvent();
    return () => { alive = false; };
  }, [user, verificationStatus]);

  useEffect(() => {
    let alive = true;

    const loadCourtesyRetryState = async () => {
      if (!user || (verificationStatus !== 'failed' && verificationStatus !== 'expired')) {
        if (alive) setCourtesyRetryAvailable(false);
        return;
      }

      const { data, error } = await supabase
        .from('payment_events')
        .select('id')
        .eq('user_id', user.id)
        .eq('purpose', 'verification_fee')
        .not('courtesy_retry_granted_at', 'is', null)
        .is('courtesy_retry_consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!alive) return;
      setCourtesyRetryAvailable(!error && !!data);
    };

    loadCourtesyRetryState();
    return () => { alive = false; };
  }, [user, verificationStatus]);

  const handleSendTestNotification = async () => {
    setSendingTestPush(true);
    try {
      const result = await callEdgeFunction<{
        ok: boolean;
        reason?: string;
        token?: string;
        expo?: any;
      }>('send-test-notification', {});

      if (result.reason === 'no_token') {
        Alert.alert('No Push Token', 'This device has not registered a push token yet. Close and reopen the app, then try again.');
        return;
      }

      const payload = Array.isArray(result.expo?.data) ? result.expo?.data?.[0] : result.expo?.data;
      const status = payload?.status;
      const message = payload?.message;

      Alert.alert(
        'Test Notification Sent',
        status
          ? `Expo status: ${status}${message ? `\n${message}` : ''}`
          : 'Request accepted by the push service. Check the device for delivery.'
      );
    } catch {
      Alert.alert('Test Notification Failed', 'Could not send a test notification. Please try again.');
    } finally {
      setSendingTestPush(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>Account</Text>

      <View style={styles.profileCard}>
        <ProfileAvatar
          name={profile?.display_name ?? 'TapnSign'}
          uri={profile?.avatar_url}
          videoUrl={profile?.profile_avatar?.video_url}
          strokes={profile?.profile_avatar?.strokes_json ?? []}
          captureWidth={profile?.profile_avatar?.capture_width ?? 1}
          captureHeight={profile?.profile_avatar?.capture_height ?? 1}
          strokeColor={profile?.profile_avatar?.stroke_color}
          size={84}
        />
        <View style={styles.profileCardCopy}>
          <Text style={styles.profileCardName}>{profile?.display_name ?? 'TapnSign Member'}</Text>
        </View>
        <Pressable
          style={[styles.avatarButton, (loadingAvatarOptions || savingAvatar) && { opacity: 0.6 }]}
          onPress={loadAvatarOptions}
          disabled={loadingAvatarOptions || savingAvatar}
        >
          {loadingAvatarOptions
            ? <ActivityIndicator color="#111" />
            : <Text style={styles.avatarButtonText}>Choose From My Autographs</Text>}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Row label="Name" value={profile?.display_name ?? '—'} />
        <Row label="Email" value={user?.email ?? '—'} />
        <Row label="Status" value={profile?.role === 'verified' ? 'Verified' : 'Member'} />
        <Row label="Project Ref" value={projectRef} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionHeader}>Instagram</Text>
        <Text style={styles.sectionSubtext}>
          Add your Instagram handle to show a linked social profile on your TapnSign account.
        </Text>
        <Row label="Instagram Status" value={instagramStatusLabel} />
        <View style={styles.instagramRow}>
          <Text style={styles.instagramAt}>@</Text>
          <TextInput
            style={styles.instagramInput}
            value={instagramHandle}
            onChangeText={setInstagramHandle}
            placeholder="your_handle"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.instagramSaveButton, savingInstagram && { opacity: 0.6 }]}
            onPress={handleSaveInstagram}
            disabled={savingInstagram}
          >
            <Text style={styles.instagramSaveText}>{savingInstagram ? '…' : 'Save'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionHeader}>Notifications</Text>
        {loadingPushDiagnostics ? (
          <View style={styles.diagnosticsLoading}>
            <ActivityIndicator color={BrandColors.primary} />
          </View>
        ) : (
          <>
            <Row label="Permission" value={pushDiagnostics?.permissionStatus ?? 'unknown'} />
            <Row
              label="Push Status"
              value={
                pushDiagnostics?.registrationState === 'ready'
                  ? 'Ready'
                  : pushDiagnostics?.registrationState === 'unavailable'
                    ? 'Unavailable on this build'
                    : pushDiagnostics?.registrationState === 'permission_denied'
                      ? 'Permission denied'
                      : 'Registration error'
              }
            />
            <Row label="Push Project" value={pushDiagnostics?.projectId ?? 'unknown'} />
            <Row label="Token" value={pushDiagnostics?.token ? 'Registered' : 'Not Registered'} />
            {pushDiagnostics?.errorMessage ? (
              <Text style={styles.diagnosticsError}>{pushDiagnostics.errorMessage}</Text>
            ) : null}
          </>
        )}
      </View>

      {profile?.role === 'member' && verificationStatus === 'none' && (
        <>
          <VerificationPolicyCard />
          <Pressable style={styles.verifyButton} onPress={handleApplyForVerification} disabled={verifying}>
            {verifying
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.verifyButtonText}>Apply for Verification — $4.99</Text>
            }
          </Pressable>
        </>
      )}

      {profile?.role === 'member' && verificationStatus === 'pending' && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>Verification Pending</Text>
          <Text style={styles.pendingSubtext}>We&apos;re reviewing your ID. This usually takes a few minutes, but some reviews can take longer.</Text>
        </View>
      )}

      {profile?.role === 'member' && (verificationStatus === 'failed' || verificationStatus === 'expired') && (
        <>
          <View style={styles.failedBanner}>
            <Text style={styles.failedText}>
              {verificationStatus === 'expired' ? 'Verification Expired' : 'Verification Failed'}
            </Text>
            <Text style={styles.failedSubtext}>
              {getVerificationFailureExplanation(latestVerificationEvent, verificationStatus)}
            </Text>
            <VerificationGuidance compact />
            {courtesyRetryAvailable ? (
              <View style={styles.courtesyRetryBanner}>
                <Text style={styles.courtesyRetryText}>
                  A TapnSign support retry has been approved. You can start a new verification attempt without another payment.
                </Text>
              </View>
            ) : (
              <Text style={styles.failedSupportText}>
                If this looks like a simple user-error issue, TapnSign support may be able to help before you pay again.
              </Text>
            )}
          </View>
          <Pressable style={styles.verifyButton} onPress={handleApplyForVerification} disabled={verifying}>
            {verifying
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.verifyButtonText}>
                  {courtesyRetryAvailable ? 'Start Courtesy Retry' : 'Start New Verification Attempt — $4.99'}
                </Text>
            }
          </Pressable>
        </>
      )}

      <Pressable style={styles.testPushButton} onPress={handleSendTestNotification} disabled={sendingTestPush}>
        {sendingTestPush
          ? <ActivityIndicator color="#111" />
          : <Text style={styles.testPushButtonText}>Send Test Notification</Text>
        }
      </Pressable>

      {profile?.role === 'admin' && (
        <Pressable style={styles.adminButton} onPress={() => router.push('/admin')}>
          <Text style={styles.adminButtonText}>Admin — Creator Verifications</Text>
        </Pressable>
      )}

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <Modal
        visible={avatarPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { if (!savingAvatar) setAvatarPickerVisible(false); }}
      >
        <Pressable style={styles.avatarModalOverlay} onPress={() => { if (!savingAvatar) setAvatarPickerVisible(false); }}>
          <View style={styles.avatarModalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.avatarModalTitle}>Choose Profile Image</Text>
            <Text style={styles.avatarModalSubtitle}>Select one of your self-created autograph thumbnails.</Text>
            <Pressable
              style={[styles.clearAvatarButton, savingAvatar && { opacity: 0.6 }]}
              onPress={() => handleSelectAvatarAutograph(null)}
              disabled={savingAvatar}
            >
              <Text style={styles.clearAvatarButtonText}>Use Default Initial</Text>
            </Pressable>
            <FlatList
              data={avatarOptions}
              keyExtractor={(item) => item.id}
              numColumns={3}
              contentContainerStyle={styles.avatarGrid}
              columnWrapperStyle={styles.avatarGridRow}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.avatarOption, savingAvatar && { opacity: 0.6 }]}
                  onPress={() => handleSelectAvatarAutograph(item.id)}
                  disabled={savingAvatar}
                >
                  {item.video_url ? (
                    <PublicVideoThumbnail
                      videoUrl={item.video_url}
                      strokes={item.strokes_json ?? []}
                      captureWidth={item.capture_width ?? 1}
                      captureHeight={item.capture_height ?? 1}
                      strokeColor={item.stroke_color ?? '#FA0909'}
                      shellStyle={styles.avatarOptionImage}
                    />
                  ) : item.thumbnail_url ? (
                    <Image source={{ uri: item.thumbnail_url }} style={styles.avatarOptionImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.avatarOptionFallback}>
                      <Text style={styles.avatarOptionFallbackText}>TapnSign</Text>
                    </View>
                  )}
                  <Text style={styles.avatarOptionText}>
                    {item.creator_sequence_number != null ? `#${item.creator_sequence_number}` : 'Autograph'}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.avatarEmptyText}>Create an autograph first, then you can use its thumbnail as your profile image.</Text>
              }
            />
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.background,
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  title: {
    fontSize: 56,
    lineHeight: 72,
    fontFamily: BrandFonts.primary,
    color: '#111',
    marginBottom: 32,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
    alignItems: 'center',
  },
  profileCardCopy: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  profileCardName: {
    fontSize: 22,
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontWeight: '800',
    marginBottom: 4,
  },
  avatarButton: {
    marginTop: 6,
    backgroundColor: '#f3f0e8',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarButtonText: {
    fontSize: 14,
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionSubtext: {
    fontSize: 13,
    lineHeight: 18,
    color: '#777',
    paddingBottom: 6,
    fontFamily: BrandFonts.primary,
  },
  diagnosticsLoading: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  diagnosticsError: {
    fontSize: 13,
    color: '#B3261E',
    lineHeight: 18,
    paddingBottom: 16,
    fontFamily: BrandFonts.primary,
  },
  verificationCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ece4d3',
  },
  verificationCardTitle: {
    fontSize: 18,
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontWeight: '800',
    marginBottom: 8,
  },
  verificationCardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
    fontFamily: BrandFonts.primary,
    marginBottom: 8,
  },
  verificationCardPolicy: {
    fontSize: 14,
    lineHeight: 20,
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
    marginBottom: 8,
  },
  verificationCardNote: {
    fontSize: 13,
    lineHeight: 18,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  guidanceBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  guidanceCompact: {
    marginTop: 12,
  },
  guidanceTitle: {
    fontSize: 14,
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontWeight: '800',
    marginBottom: 8,
  },
  guidanceItem: {
    fontSize: 13,
    lineHeight: 19,
    color: '#444',
    fontFamily: BrandFonts.primary,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: {
    fontSize: 16,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  verifyButton: {
    backgroundColor: BrandColors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  pendingBanner: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  pendingText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F57F17',
    fontFamily: BrandFonts.primary,
    marginBottom: 4,
  },
  pendingSubtext: {
    fontSize: 13,
    color: '#F57F17',
    fontFamily: BrandFonts.primary,
  },
  failedBanner: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  failedText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    marginBottom: 4,
  },
  failedSubtext: {
    fontSize: 13,
    color: '#111',
    fontFamily: BrandFonts.primary,
    lineHeight: 19,
  },
  failedSupportText: {
    fontSize: 13,
    color: '#7a2e2e',
    fontFamily: BrandFonts.primary,
    lineHeight: 18,
    marginTop: 12,
  },
  courtesyRetryBanner: {
    marginTop: 12,
    backgroundColor: '#F0F7EA',
    borderRadius: 10,
    padding: 12,
  },
  courtesyRetryText: {
    fontSize: 13,
    color: '#285a1e',
    fontFamily: BrandFonts.primary,
    lineHeight: 18,
  },
  testPushButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  testPushButtonText: {
    color: '#111',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  adminButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  adminButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  signOutButton: {
    backgroundColor: BrandColors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  instagramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  instagramAt: {
    fontSize: 16,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  instagramInput: {
    flex: 1,
    fontSize: 16,
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  instagramSaveButton: {
    backgroundColor: BrandColors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  instagramSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  instagramVerifyButton: {
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d8c6a3',
    backgroundColor: '#f7efe0',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  instagramVerifyButtonText: {
    color: '#111',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  instagramActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  instagramCheckButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  instagramCheckButtonText: {
    color: '#111',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  avatarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  avatarModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    maxHeight: '78%',
  },
  avatarModalTitle: {
    fontSize: 22,
    color: '#111',
    fontWeight: '800',
    fontFamily: BrandFonts.primary,
    textAlign: 'center',
  },
  avatarModalSubtitle: {
    fontSize: 13,
    color: '#777',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 14,
    fontFamily: BrandFonts.primary,
  },
  clearAvatarButton: {
    alignSelf: 'center',
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  clearAvatarButtonText: {
    fontSize: 13,
    color: '#111',
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  avatarGrid: {
    paddingBottom: 8,
  },
  avatarGridRow: {
    gap: 12,
    marginBottom: 12,
  },
  avatarOption: {
    flex: 1,
    alignItems: 'center',
  },
  avatarOptionImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#e6e1d7',
  },
  avatarOptionFallback: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#f1ece1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOptionFallbackText: {
    fontSize: 12,
    color: '#777',
    fontFamily: BrandFonts.primary,
  },
  avatarOptionText: {
    marginTop: 8,
    fontSize: 12,
    color: '#333',
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
  },
  avatarEmptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 18,
    fontFamily: BrandFonts.primary,
  },
});

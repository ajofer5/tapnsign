import { BrandColors, BrandFonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useStripe } from '@stripe/stripe-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export default function AccountScreen() {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [verifying, setVerifying] = useState(false);

  const handleApplyForVerification = async () => {
    if (!user) return;
    setVerifying(true);

    try {
      // Step 1: Create payment intent for $4.99
      const paymentResponse = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-verification-payment-intent`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const paymentData = await paymentResponse.json();

      if (!paymentResponse.ok || !paymentData?.client_secret) {
        Alert.alert('Error', paymentData?.error ?? 'Could not start payment. Please try again.');
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
      const identityResponse = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-identity-session`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_id: user.id }),
        }
      );
      const identityData = await identityResponse.json();

      if (!identityResponse.ok || !identityData?.url) {
        Alert.alert('Error', identityData?.error ?? 'Payment received but could not start identity check. Contact support.');
        setVerifying(false);
        return;
      }

      // Step 4: Open Stripe Identity in browser
      await WebBrowser.openBrowserAsync(identityData.url);

      // Refresh profile to show pending status
      await refreshProfile();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong.');
    }

    setVerifying(false);
  };

  const verificationStatus = profile?.verification_status ?? 'none';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>

      <View style={styles.card}>
        <Row label="Name" value={profile?.display_name ?? '—'} />
        <Row label="Email" value={user?.email ?? '—'} />
        <Row label="Status" value={profile?.role === 'verified' ? 'Verified' : 'Member'} />
      </View>

      {profile?.role === 'member' && verificationStatus === 'none' && (
        <Pressable style={styles.verifyButton} onPress={handleApplyForVerification} disabled={verifying}>
          {verifying
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.verifyButtonText}>Apply for Verification — $4.99</Text>
          }
        </Pressable>
      )}

      {profile?.role === 'member' && verificationStatus === 'pending' && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>Verification Pending</Text>
          <Text style={styles.pendingSubtext}>We're reviewing your ID. This usually takes a few minutes.</Text>
        </View>
      )}

      {profile?.role === 'member' && verificationStatus === 'failed' && (
        <>
          <View style={styles.failedBanner}>
            <Text style={styles.failedText}>Verification Failed</Text>
            <Text style={styles.failedSubtext}>We could not verify your identity. Please try again.</Text>
          </View>
          <Pressable style={styles.verifyButton} onPress={handleApplyForVerification} disabled={verifying}>
            {verifying
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.verifyButtonText}>Retry Verification — $4.99</Text>
            }
          </Pressable>
        </>
      )}

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </View>
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 20,
    marginBottom: 24,
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
});

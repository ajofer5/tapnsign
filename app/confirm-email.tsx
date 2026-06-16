import { BrandColors, BrandFonts } from '@/constants/theme';
import { Link, useLocalSearchParams } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';

export default function ConfirmEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const emailAddress = typeof email === 'string' ? email : null;

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/Ophinia_name_no tm_white.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>Confirm your email address to access Ophinia.</Text>
      {emailAddress ? (
        <Text style={styles.body}>We sent a confirmation link to {emailAddress}.</Text>
      ) : (
        <Text style={styles.body}>We sent a confirmation link to the email address you used to sign up.</Text>
      )}
      <Text style={styles.helper}>After confirming your email, return here and sign in.</Text>
      <Link href="/login" style={styles.linkText}>
        Back to Sign In
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    width: 260,
    height: 110,
    marginBottom: 34,
  },
  title: {
    color: BrandColors.primary,
    fontFamily: BrandFonts.primary,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
    textAlign: 'center',
    marginBottom: 14,
  },
  body: {
    color: '#333',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 10,
  },
  helper: {
    color: '#777',
    fontFamily: BrandFonts.primary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 28,
  },
  linkText: {
    color: BrandColors.primary,
    fontFamily: BrandFonts.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});

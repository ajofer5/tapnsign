import { BrandColors, BrandFonts } from '@/constants/theme';
import { MAX_DISPLAY_NAME_LENGTH, normalizeDisplayName } from '@/lib/display-name';
import { signInWithApple, signInWithGoogle } from '@/lib/social-auth';
import { supabase } from '@/lib/supabase';
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getAge(year: number, month: number, day: number): number {
  const today = new Date();
  const birthDate = new Date(year, month - 1, day);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

export default function SignupScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // DOB
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (active) setAppleAvailable(available);
      })
      .catch(() => {
        if (active) setAppleAvailable(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSignup = async () => {
    const normalizedDisplayName = normalizeDisplayName(displayName);

    if (!normalizedDisplayName || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    if (normalizedDisplayName.length > MAX_DISPLAY_NAME_LENGTH) {
      Alert.alert('Error', `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`);
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }

    // Validate DOB
    const monthNum = parseInt(dobMonth, 10);
    const dayNum = parseInt(dobDay, 10);
    const yearNum = parseInt(dobYear, 10);
    if (!dobMonth || !dobDay || !dobYear || isNaN(monthNum) || isNaN(dayNum) || isNaN(yearNum)
      || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31
      || yearNum < 1900 || yearNum > new Date().getFullYear()) {
      Alert.alert('Error', 'Please enter a valid date of birth.');
      return;
    }
    const age = getAge(yearNum, monthNum, dayNum);
    if (age < 13) {
      Alert.alert('Age Requirement', 'You must be at least 13 years old to create an account.');
      return;
    }
    if (!ageConfirmed) {
      Alert.alert('Error', 'Please confirm that you are 13 or older and agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: normalizedDisplayName,
          birthday_year: yearNum,
          birthday_month: monthNum,
          birthday_day: dayNum,
        },
      },
    });
    setLoading(false);

    if (error) {
      const message = error.message?.toLowerCase().includes('already registered')
        ? 'An account with this email already exists. Try signing in instead.'
        : error.message?.toLowerCase().includes('invalid email')
        ? 'Please enter a valid email address.'
        : 'Account creation failed. Please try again.';
      Alert.alert('Sign Up Failed', message);
    } else {
      router.replace({
        pathname: '/confirm-email',
        params: { email: email.trim() },
      });
    }
  };

  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (!result.canceled) {
        router.replace('/');
      }
    } catch (error) {
      Alert.alert('Google Sign-In Failed', error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignup = async () => {
    setAppleLoading(true);
    try {
      const result = await signInWithApple();
      if (!result.canceled) {
        router.replace('/');
      }
    } catch (error) {
      Alert.alert('Apple Sign-In Failed', error instanceof Error ? error.message : 'Apple sign-in failed. Please try again.');
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <Image
        source={require('../assets/images/Ophinia_name_no tm_white.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <TextInput
        style={styles.input}
        placeholder="Display Name"
        placeholderTextColor="#999"
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={MAX_DISPLAY_NAME_LENGTH}
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <View style={styles.passwordInputWrap}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password (min 6 characters)"
          placeholderTextColor="#999"
          secureTextEntry={!passwordVisible}
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={styles.passwordToggle}
          onPress={() => setPasswordVisible((visible) => !visible)}
          accessibilityRole="button"
          accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
        >
          <Text style={styles.passwordToggleText}>{passwordVisible ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>

      {/* Date of birth */}
      <Text style={styles.dobLabel}>Date of Birth</Text>
      <View style={styles.dobRow}>
        <TextInput
          style={[styles.input, styles.dobMonth]}
          placeholder="MM"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          maxLength={2}
          value={dobMonth}
          onChangeText={setDobMonth}
        />
        <TextInput
          style={[styles.input, styles.dobDay]}
          placeholder="DD"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          maxLength={2}
          value={dobDay}
          onChangeText={setDobDay}
        />
        <TextInput
          style={[styles.input, styles.dobYear]}
          placeholder="YYYY"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          maxLength={4}
          value={dobYear}
          onChangeText={setDobYear}
        />
      </View>

      {/* Age confirmation checkbox */}
      <Pressable style={styles.checkboxRow} onPress={() => setAgeConfirmed((v) => !v)}>
        <View style={[styles.checkbox, ageConfirmed && styles.checkboxChecked]}>
          {ageConfirmed && <Text style={styles.checkboxTick}>✓</Text>}
        </View>
        <Text style={styles.checkboxLabel}>
          I confirm I am 13 or older and agree to the{' '}
          <Text style={styles.checkboxLink}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.checkboxLink}>Privacy Policy</Text>
        </Text>
      </Pressable>

      <Pressable style={styles.button} onPress={handleSignup} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
      </Pressable>

      <Text style={styles.socialDivider}>or continue with</Text>

      <Pressable
        style={[styles.socialButton, (googleLoading || loading || appleLoading) && styles.socialButtonDisabled]}
        onPress={handleGoogleSignup}
        disabled={googleLoading || loading || appleLoading}
      >
        <Text style={styles.socialButtonText}>{googleLoading ? 'Connecting Google…' : 'Continue with Google'}</Text>
      </Pressable>

      {Platform.OS === 'ios' && appleAvailable ? (
        <Pressable
          style={[styles.socialButton, styles.appleButton, (appleLoading || loading || googleLoading) && styles.socialButtonDisabled]}
          onPress={handleAppleSignup}
          disabled={appleLoading || loading || googleLoading}
        >
          <Text style={styles.appleButtonText}>{appleLoading ? 'Connecting Apple…' : 'Continue with Apple'}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.socialHint}>
        If you already have an Ophinia account, sign in with your current method first and connect Google or Apple from Account to avoid duplicate accounts.
      </Text>

      <Link href="/login" style={styles.linkText}>
        Already have an account? Sign in
      </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  logo: {
    width: '70%',
    height: 80,
    marginBottom: 40,
  },
  input: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
    color: '#333',
    borderWidth: 1,
    borderColor: '#555',
  },
  passwordInputWrap: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#555',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
  },
  passwordToggle: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  passwordToggleText: {
    color: BrandColors.primary,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  button: {
    width: '100%',
    backgroundColor: BrandColors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  socialDivider: {
    marginBottom: 12,
    color: '#666',
    fontFamily: BrandFonts.primary,
    fontSize: 14,
  },
  socialButton: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  socialButtonDisabled: {
    opacity: 0.6,
  },
  socialButtonText: {
    color: '#111',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  appleButton: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  appleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  socialHint: {
    color: '#666',
    fontFamily: BrandFonts.primary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 18,
  },
  linkText: {
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
  },
  dobLabel: {
    alignSelf: 'flex-start',
    fontSize: 13,
    color: '#666',
    fontFamily: BrandFonts.primary,
    marginBottom: 6,
    marginTop: 2,
  },
  dobRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
  },
  dobMonth: {
    flex: 2,
    width: undefined,
  },
  dobDay: {
    flex: 2,
    width: undefined,
  },
  dobYear: {
    flex: 3,
    width: undefined,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: 16,
    marginTop: 4,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: BrandColors.primary,
    borderColor: BrandColors.primary,
  },
  checkboxTick: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    color: '#555',
    fontFamily: BrandFonts.primary,
    lineHeight: 18,
  },
  checkboxLink: {
    color: BrandColors.primary,
    textDecorationLine: 'underline',
  },
});

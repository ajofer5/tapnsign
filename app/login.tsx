import { BrandColors, BrandFonts } from '@/constants/theme';
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

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

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

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      if (error.message?.toLowerCase().includes('email not confirmed')) {
        router.push({
          pathname: '/confirm-email',
          params: { email: email.trim() },
        });
        return;
      }

      const message = error.message?.toLowerCase().includes('invalid login credentials')
        ? 'Incorrect email or password. Please try again.'
        : 'Sign in failed. Please try again.';
      Alert.alert('Login Failed', message);
    } else {
      router.replace('/');
    }
  };

  const handleGoogleLogin = async () => {
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

  const handleAppleLogin = async () => {
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
        <View style={styles.logoWrap}>
          {!logoFailed ? (
            <Image
              source={require('../assets/images/Ophinia_name_white.png')}
              style={styles.logo}
              resizeMode="contain"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <Text style={styles.logoFallback}>Ophinia</Text>
          )}
        </View>

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
            placeholder="Password"
            placeholderTextColor="#999"
            secureTextEntry={!passwordVisible}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
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

        <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign In'}</Text>
        </Pressable>

        <Text style={styles.socialDivider}>or continue with</Text>

        <Pressable
          style={[styles.socialButton, (googleLoading || loading || appleLoading) && styles.socialButtonDisabled]}
          onPress={handleGoogleLogin}
          disabled={googleLoading || loading || appleLoading}
        >
          <Text style={styles.socialButtonText}>{googleLoading ? 'Connecting Google…' : 'Continue with Google'}</Text>
        </Pressable>

        {Platform.OS === 'ios' && appleAvailable ? (
        <Pressable
          style={[styles.socialButton, styles.appleButton, (appleLoading || loading || googleLoading) && styles.socialButtonDisabled]}
          onPress={handleAppleLogin}
          disabled={appleLoading || loading || googleLoading}
        >
          <Text style={styles.appleButtonText}>{appleLoading ? 'Connecting Apple…' : 'Continue with Apple'}</Text>
        </Pressable>
        ) : null}

        <Text style={styles.socialHint}>
          If you already have an Ophinia account, use your current sign-in method first, then connect Google or Apple from Account.
        </Text>

        <Link href="/signup" style={styles.linkText}>
          Don&apos;t have an account? Sign up
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 32,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 88,
    paddingBottom: 36,
  },
  logo: {
    width: 220,
    height: 64,
  },
  logoWrap: {
    width: 220,
    height: 64,
    marginBottom: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallback: {
    color: BrandColors.primary,
    fontFamily: BrandFonts.primary,
    fontSize: 34,
    fontWeight: '800',
  },
  input: {
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
    color: '#333',
  },
  passwordInputWrap: {
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
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
});

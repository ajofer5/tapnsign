import { BrandColors, BrandFonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Role = 'member' | 'verified';

export default function SignupScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!displayName || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          role,
        },
      },
    });
    setLoading(false);

    if (error) {
      Alert.alert('Sign Up Failed', error.message);
    } else {
      Alert.alert(
        'Account Created',
        'Welcome to TapnSign!',
        [{ text: 'OK', onPress: () => router.replace('/') }]
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>TapnSign</Text>

      {/* Role selector */}
      <View style={styles.roleRow}>
        <Pressable
          style={[styles.roleButton, role === 'member' && styles.roleButtonActive]}
          onPress={() => setRole('member')}
        >
          <Text style={[styles.roleButtonText, role === 'member' && styles.roleButtonTextActive]}>
            Member
          </Text>
        </Pressable>
        <Pressable
          style={[styles.roleButton, role === 'verified' && styles.roleButtonActive]}
          onPress={() => setRole('verified')}
        >
          <Text style={[styles.roleButtonText, role === 'verified' && styles.roleButtonTextActive]}>
            Verified
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Display Name"
        placeholderTextColor="#999"
        value={displayName}
        onChangeText={setDisplayName}
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

      <TextInput
        style={styles.input}
        placeholder="Password (min 6 characters)"
        placeholderTextColor="#999"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable style={styles.button} onPress={handleSignup} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
      </Pressable>

      <Link href="/login" style={styles.linkText}>
        Already have an account? Sign in
      </Link>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 80,
    lineHeight: 104,
    fontFamily: BrandFonts.primary,
    color: '#111',
    marginBottom: 40,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BrandColors.primary,
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: BrandColors.primary,
  },
  roleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
    color: '#111',
  },
  roleButtonTextActive: {
    color: '#fff',
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
  },
  button: {
    width: '100%',
    backgroundColor: BrandColors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  linkText: {
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
  },
});

import { AppTabBar, useShouldShowAppTabBar } from '@/components/app-tab-bar';
import { BrandColors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Redirect, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import StripeProvider from '@/lib/stripe-provider';
import { View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const { session, loading } = useAuth();
  const colorScheme = useColorScheme();
  const showAppTabBar = useShouldShowAppTabBar();

  if (loading) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: BrandColors.background },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: BrandColors.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="signup" options={{ headerShown: false }} />
            <Stack.Screen name="capture" options={{ title: 'Capture Autograph', headerBackButtonDisplayMode: 'minimal' }} />
            <Stack.Screen name="autographs" options={{ title: 'My Autographs', headerBackButtonDisplayMode: 'minimal' }} />
            <Stack.Screen name="marketplace" options={{ title: 'Marketplace', headerBackButtonDisplayMode: 'minimal' }} />
            <Stack.Screen name="account" options={{ title: 'Account', headerBackButtonDisplayMode: 'minimal' }} />
            <Stack.Screen name="thankyou" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            <Stack.Screen name="verify/[id]" options={{ title: 'Verify Autograph' }} />
            <Stack.Screen name="profile/[id]" options={{ title: 'Profile', headerBackButtonDisplayMode: 'minimal' }} />
            <Stack.Screen name="admin" options={{ title: 'Admin', headerBackButtonDisplayMode: 'minimal' }} />
          </Stack>
        </View>
        {session && showAppTabBar ? <AppTabBar /> : null}
      </View>
      {!session && <Redirect href="/login" />}
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}>
        <RootNavigator />
      </StripeProvider>
    </AuthProvider>
  );
}

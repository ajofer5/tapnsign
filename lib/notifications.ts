import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const PUSH_REGISTRATION_TTL_MS = 6 * 60 * 60 * 1000;

let lastRegisteredUserId: string | null = null;
let lastRegisteredToken: string | null = null;
let lastRegisteredAt = 0;
const registrationPromises = new Map<string, Promise<void>>();

export type PushDiagnostics = {
  permissionStatus: string;
  projectId: string;
  token: string | null;
  registrationState: 'ready' | 'unavailable' | 'permission_denied' | 'error';
  errorMessage: string | null;
};

function getProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    '985dc536-2d58-499d-bab4-07b27d8f73a7'
  );
}

export async function getPushDiagnostics(): Promise<PushDiagnostics> {
  const { status } = await Notifications.getPermissionsAsync();
  const projectId = getProjectId();

  if (status !== 'granted') {
    return {
      permissionStatus: status,
      projectId,
      token: null,
      registrationState: 'permission_denied',
      errorMessage: null,
    };
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return {
      permissionStatus: status,
      projectId,
      token,
      registrationState: 'ready',
      errorMessage: null,
    };
  } catch (error: any) {
    const message = error?.message ?? 'Unknown push registration error.';
    const unavailable = message.includes('aps-environment');
    return {
      permissionStatus: status,
      projectId,
      token: null,
      registrationState: unavailable ? 'unavailable' : 'error',
      errorMessage: message,
    };
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPushToken(userId: string, options?: { force?: boolean }) {
  const existing = registrationPromises.get(userId);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      const projectId = getProjectId();
      const token = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;

      const now = Date.now();
      const shouldSkipUpsert =
        !options?.force &&
        lastRegisteredUserId === userId &&
        lastRegisteredToken === token &&
        now - lastRegisteredAt < PUSH_REGISTRATION_TTL_MS;

      if (shouldSkipUpsert) {
        return;
      }

      const timestamp = new Date(now).toISOString();
      await supabase.from('push_tokens').upsert(
        {
          user_id: userId,
          token,
          platform: Platform.OS,
          updated_at: timestamp,
          last_seen_at: timestamp,
          revoked_at: null,
        },
        { onConflict: 'user_id' }
      );

      lastRegisteredUserId = userId;
      lastRegisteredToken = token;
      lastRegisteredAt = now;
    } catch (e) {
      console.log('Push token registration unavailable:', (e as any)?.message ?? e);
    } finally {
      registrationPromises.delete(userId);
    }
  })();

  registrationPromises.set(userId, promise);
  return promise;
}

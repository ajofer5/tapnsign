import { BrandColors, BrandFonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { callEdgeFunction } from '@/lib/api';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

type CreatorVerification = {
  user_id: string;
  display_name: string;
  role: string;
  verification_status: 'pending' | 'verified' | 'failed' | 'expired';
  verification_updated_at: string | null;
  latest_error: { code?: string; reason?: string; message?: string } | null;
  courtesy_retry_active: boolean;
  can_grant_retry: boolean;
};

const STATUS_COLORS: Record<string, string> = {
  verified: '#16a34a',
  pending: '#d97706',
  failed: '#dc2626',
  expired: '#6b7280',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: STATUS_COLORS[status] ?? '#6b7280' }]}>
      <Text style={styles.badgeText}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
    </View>
  );
}

function CreatorRow({
  item,
  onGrantRetry,
  granting,
}: {
  item: CreatorVerification;
  onGrantRetry: (userId: string, name: string) => void;
  granting: string | null;
}) {
  const date = item.verification_updated_at
    ? new Date(item.verification_updated_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : '—';

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.name}>{item.display_name}</Text>
        <StatusBadge status={item.verification_status} />
      </View>
      <Text style={styles.meta}>Updated {date}</Text>
      {item.latest_error?.code && (
        <Text style={styles.errorText}>Error: {item.latest_error.code}</Text>
      )}
      {item.courtesy_retry_active && (
        <Text style={styles.retryActiveText}>Courtesy retry granted — awaiting use</Text>
      )}
      {item.can_grant_retry && (
        <Pressable
          style={[styles.retryButton, granting === item.user_id && { opacity: 0.6 }]}
          onPress={() => onGrantRetry(item.user_id, item.display_name)}
          disabled={granting !== null}
        >
          {granting === item.user_id
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.retryButtonText}>Grant Courtesy Retry</Text>
          }
        </Pressable>
      )}
    </View>
  );
}

export default function AdminScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [creators, setCreators] = useState<CreatorVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [granting, setGranting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await callEdgeFunction<{ creators: CreatorVerification[] }>('get-creator-verifications');
      setCreators(data.creators);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }, []);

  useEffect(() => {
    if (profile?.role !== 'admin') {
      router.replace('/(tabs)');
      return;
    }
    load().finally(() => setLoading(false));
  }, [profile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleGrantRetry = useCallback((userId: string, name: string) => {
    Alert.alert(
      'Grant Courtesy Retry',
      `Grant a free retry to ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Grant',
          style: 'default',
          onPress: async () => {
            setGranting(userId);
            try {
              await callEdgeFunction('grant-verification-courtesy-retry', { user_id: userId });
              Alert.alert('Done', `Courtesy retry granted to ${name}.`);
              await load();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setGranting(null);
            }
          },
        },
      ]
    );
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={BrandColors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={creators}
      keyExtractor={(item) => item.user_id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <Text style={styles.header}>Creator Verifications</Text>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>No verification attempts yet.</Text>
      }
      renderItem={({ item }) => (
        <CreatorRow item={item} onGrantRetry={handleGrantRetry} granting={granting} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BrandColors.background,
  },
  list: {
    padding: 16,
    gap: 12,
    backgroundColor: BrandColors.background,
  },
  header: {
    fontFamily: BrandFonts.bold,
    fontSize: 20,
    color: '#111',
    marginBottom: 8,
  },
  empty: {
    fontFamily: BrandFonts.regular,
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontFamily: BrandFonts.bold,
    fontSize: 15,
    color: '#111',
    flex: 1,
    marginRight: 8,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: BrandFonts.bold,
  },
  meta: {
    fontFamily: BrandFonts.regular,
    fontSize: 12,
    color: '#6b7280',
  },
  errorText: {
    fontFamily: BrandFonts.regular,
    fontSize: 12,
    color: '#dc2626',
  },
  retryActiveText: {
    fontFamily: BrandFonts.regular,
    fontSize: 12,
    color: '#d97706',
  },
  retryButton: {
    marginTop: 4,
    backgroundColor: BrandColors.primary,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontFamily: BrandFonts.bold,
    fontSize: 13,
  },
});

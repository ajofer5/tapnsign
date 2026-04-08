import { BrandColors, BrandFonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

type ActivityEntry = {
  id: string;
  type: 'sold' | 'purchased' | 'bid_placed' | 'auction_won' | 'auction_lost';
  autographId: string;
  celebrityName: string;
  amountCents: number;
  date: string;
};

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

const EVENT_CONFIG: Record<ActivityEntry['type'], { label: string }> = {
  sold:         { label: 'Sold' },
  purchased:    { label: 'Purchased' },
  bid_placed:   { label: 'Bid Placed' },
  auction_won:  { label: 'Auction Won' },
  auction_lost: { label: 'Auction Lost' },
};

export default function ActivityScreen() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoading(true);

      Promise.all([
        // Transfers: sold or purchased
        supabase
          .from('transfers')
          .select('id, autograph_id, from_user_id, to_user_id, price_cents, transferred_at, autograph:autograph_id ( celebrity:celebrity_id ( display_name ) )')
          .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
          .order('transferred_at', { ascending: false }),

      ]).then(([transfersRes]) => {
        const results: ActivityEntry[] = [];

        for (const t of transfersRes.data ?? []) {
          const name = (t.autograph as any)?.celebrity?.display_name ?? 'Unknown';
          if (t.from_user_id === user.id) {
            results.push({ id: `transfer-sold-${t.id}`, type: 'sold', autographId: t.autograph_id, celebrityName: name, amountCents: t.price_cents, date: t.transferred_at });
          } else {
            results.push({ id: `transfer-purchased-${t.id}`, type: 'purchased', autographId: t.autograph_id, celebrityName: name, amountCents: t.price_cents, date: t.transferred_at });
          }
        }

        results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setEntries(results);
        setLoading(false);
      });
    }, [user])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BrandColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Activity</Text>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>No activity yet.</Text>}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const config = EVENT_CONFIG[item.type];
          return (
            <View style={styles.row}>
              <View style={styles.rowMiddle}>
                <Text style={styles.label}>{config.label}</Text>
                <Text style={styles.celebrity}>{item.celebrityName}</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.amount}>{formatPrice(item.amountCents)}</Text>
                <Text style={styles.date}>{formatDate(item.date)}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.background,
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BrandColors.background,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    fontFamily: BrandFonts.primary,
    marginBottom: 16,
    marginTop: 40,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#000',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
  },
  separator: {
    height: 1,
    backgroundColor: '#ccc',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  rowMiddle: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    fontFamily: BrandFonts.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  celebrity: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    fontFamily: BrandFonts.primary,
    marginTop: 2,
    marginLeft: 10,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
    color: '#000',
  },
  date: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});

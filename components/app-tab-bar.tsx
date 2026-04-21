import { IconSymbol } from '@/components/ui/icon-symbol';
import { BrandColors, BrandFonts } from '@/constants/theme';
import { callEdgeFunction } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabItem = {
  key: 'home' | 'activity' | 'profile';
  label: string;
  icon: string;
};

const TABS: TabItem[] = [
  { key: 'home', label: 'Home', icon: 'house.fill' },
  { key: 'activity', label: 'Activity', icon: 'list.bullet' },
  { key: 'profile', label: 'Profile', icon: 'person.fill' },
];

function activityViewedKey(userId: string) {
  return `activity_last_viewed_${userId}`;
}

function shouldShowTabBar(pathname: string) {
  if (!pathname) return false;
  if (pathname === '/login' || pathname === '/signup' || pathname === '/thankyou' || pathname === '/modal') return false;
  if (pathname === '/capture' || pathname === '/account' || pathname.startsWith('/verify/')) return false;
  return (
    pathname === '/' ||
    pathname === '/activity' ||
    pathname === '/autographs' ||
    pathname === '/marketplace' ||
    pathname.startsWith('/profile/')
  );
}

export function useShouldShowAppTabBar() {
  const pathname = usePathname();
  return shouldShowTabBar(pathname);
}

export function AppTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activityBadgeCount, setActivityBadgeCount] = useState(0);
  const [showActivityDot, setShowActivityDot] = useState(false);

  useEffect(() => {
    if (!user) {
      setActivityBadgeCount(0);
      setShowActivityDot(false);
      return;
    }

    const loadBadge = async () => {
      try {
        await callEdgeFunction('expire-autograph-offers', {});
      } catch {}

      const nowIso = new Date().toISOString();
      const [ownerRes, buyerRes, transfersRes, offersRes, lastViewed] = await Promise.all([
        supabase
          .from('autograph_offers')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', user.id)
          .eq('status', 'pending'),
        supabase
          .from('autograph_offers')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_id', user.id)
          .eq('status', 'accepted')
          .is('accepted_transfer_id', null)
          .gt('payment_due_at', nowIso),
        supabase
          .from('transfers')
          .select('transferred_at')
          .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
          .order('transferred_at', { ascending: false })
          .limit(1),
        supabase
          .from('autograph_offers')
          .select('status, created_at, responded_at, payment_due_at, accepted_transfer_id, buyer_id, owner_id')
          .or(`buyer_id.eq.${user.id},owner_id.eq.${user.id}`)
          .order('responded_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(20),
        AsyncStorage.getItem(activityViewedKey(user.id)),
      ]);

      setActivityBadgeCount((ownerRes.count ?? 0) + (buyerRes.count ?? 0));

      const latestTransferAt = transfersRes.data?.[0]?.transferred_at ?? null;
      const latestNonActionOfferAt =
        (offersRes.data ?? [])
          .filter((offer: any) => {
            if (offer.status === 'pending') return false;
            if (
              offer.status === 'accepted' &&
              offer.buyer_id === user.id &&
              !offer.accepted_transfer_id &&
              offer.payment_due_at &&
              offer.payment_due_at > nowIso
            ) {
              return false;
            }
            return true;
          })
          .map((offer: any) => offer.responded_at ?? offer.created_at)
          .find(Boolean) ?? null;

      const latestRelevantAt = [latestTransferAt, latestNonActionOfferAt]
        .filter(Boolean)
        .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0];

      setShowActivityDot(Boolean(latestRelevantAt && (!lastViewed || new Date(latestRelevantAt).getTime() > new Date(lastViewed).getTime())));
    };

    loadBadge();
  }, [pathname, user]);

  const currentTab: TabItem['key'] =
    pathname === '/activity'
      ? 'activity'
      : pathname.startsWith('/profile/')
        ? 'profile'
        : 'home';

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.inner}>
        {TABS.map((tab) => {
          const active = currentTab === tab.key;
          const targetPath =
            tab.key === 'profile'
              ? user?.id
                ? `/profile/${user.id}`
                : '/account'
              : tab.key === 'activity'
                ? '/activity'
                : '/';
          return (
            <Pressable
              key={tab.key}
              style={styles.tab}
              onPress={() => {
                if (pathname !== targetPath) router.replace(targetPath as any);
              }}
            >
              <View style={styles.iconWrap}>
                <IconSymbol size={24} name={tab.icon as any} color={active ? BrandColors.primary : '#666'} />
                {tab.key === 'activity' && activityBadgeCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{activityBadgeCount > 9 ? '9+' : activityBadgeCount}</Text>
                  </View>
                ) : tab.key === 'activity' && showActivityDot ? (
                  <View style={styles.dot} />
                ) : null}
              </View>
              <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: BrandColors.background,
    borderTopWidth: 1,
    borderTopColor: '#e7dfd0',
    paddingTop: 8,
  },
  inner: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  iconWrap: {
    position: 'relative',
  },
  label: {
    marginTop: 4,
    fontSize: 12,
    color: '#666',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
  },
  labelActive: {
    color: BrandColors.primary,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#D72638',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D72638',
  },
});

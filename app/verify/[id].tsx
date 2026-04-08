import { supabase } from '@/lib/supabase';
import { ResizeMode, Video } from 'expo-av';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type AutographRecord = {
  certificate_id: string;
  created_at: string;
  content_hash: string;
  video_url: string;
  is_for_sale: boolean;
  price_cents: number | null;
  listing_type: 'fixed' | 'auction';
  auction_ends_at: string | null;
  reserve_price_cents: number | null;
  celebrity: {
    display_name: string;
    verified: boolean;
  };
  owner: {
    display_name: string;
  };
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function VerifyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [record, setRecord] = useState<AutographRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;

    supabase
      .from('autographs')
      .select(`
        certificate_id,
        created_at,
        content_hash,
        video_url,
        is_for_sale,
        price_cents,
        listing_type,
        auction_ends_at,
        reserve_price_cents,
        celebrity:celebrity_id ( display_name, verified ),
        owner:owner_id ( display_name )
      `)
      .eq('certificate_id', id)
      .single()
      .then(({ data, error }) => {
        setLoading(false);
        if (error || !data) { setNotFound(true); return; }
        setRecord(data as any);
      });
  }, [id]);

  const openApp = () => {
    const appUrl = `autographappv2://verify/${id}`;
    const storeUrl = 'https://apps.apple.com/app/tapnsign';
    if (Platform.OS === 'web') {
      Linking.openURL(appUrl).catch(() => Linking.openURL(storeUrl));
    } else {
      Linking.openURL(appUrl);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E53935" />
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>✗</Text>
        <Text style={styles.errorTitle}>Not Found</Text>
        <Text style={styles.errorBody}>
          This certificate ID does not match any autograph in our records.
        </Text>
      </View>
    );
  }

  const r = record!;
  const isAuction = r.listing_type === 'auction';
  const listingLabel = r.is_for_sale
    ? isAuction
      ? `Auction · Reserve ${formatPrice(r.reserve_price_cents ?? 0)}`
      : `For Sale · ${formatPrice(r.price_cents ?? 0)}`
    : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brandName}>TapnSign</Text>
        <View style={styles.verifiedBadge}>
          <Text style={styles.verifiedBadgeText}>✓ Verified Autograph</Text>
        </View>
      </View>

      {/* Celebrity name */}
      <Text style={styles.celebrityName}>{r.celebrity.display_name}</Text>
      <Text style={styles.capturedDate}>Captured {formatDateTime(r.created_at)}</Text>

      {/* Video player */}
      {Platform.OS === 'web' ? (
        <video
          src={r.video_url}
          controls
          style={{ width: '100%', borderRadius: 16, marginBottom: 24, backgroundColor: '#000', maxHeight: 320 } as any}
        />
      ) : (
        <View style={styles.nativeVideoWrapper}>
          <Video
            source={{ uri: r.video_url }}
            style={styles.nativeVideo}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
          />
        </View>
      )}

      {/* Listing status */}
      {r.is_for_sale && (
        <View style={styles.listingBanner}>
          <Text style={styles.listingBannerText}>{listingLabel}</Text>
        </View>
      )}

      {/* CTA — only show on web */}
      {Platform.OS === 'web' && (
        <>
          <Pressable style={styles.ctaButton} onPress={openApp}>
            <Text style={styles.ctaButtonText}>
              {r.is_for_sale ? 'Buy on TapnSign' : 'View on TapnSign'}
            </Text>
          </Pressable>
          <Text style={styles.ctaSubtext}>
            Download the TapnSign app to {r.is_for_sale ? 'purchase this autograph' : 'view this autograph'}.
          </Text>
        </>
      )}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Certificate details */}
      <Text style={styles.sectionTitle}>Certificate of Authenticity</Text>

      <View style={styles.card}>
        <Row label="Signed by" value={r.celebrity.display_name} />
        <Row label="Verified Account" value={r.celebrity.verified ? 'Yes' : 'Pending'} />
        <Row label="Current Owner" value={r.owner.display_name} />
        <Row label="Date Captured" value={formatDateTime(r.created_at)} />
      </View>

      <View style={styles.hashCard}>
        <Text style={styles.hashLabel}>Certificate ID</Text>
        <Text style={styles.hashValue}>{r.certificate_id}</Text>
        <Text style={[styles.hashLabel, { marginTop: 12 }]}>Content Hash (SHA-256)</Text>
        <Text style={styles.hashValue}>{r.content_hash}</Text>
      </View>

    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f5f5f5',
  },
  container: {
    padding: 24,
    backgroundColor: '#f5f5f5',
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#E53935',
  },
  verifiedBadge: {
    backgroundColor: '#E53935',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  verifiedBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  celebrityName: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
  },
  capturedDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  videoPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#222',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  videoPlaceholderText: {
    color: '#fff',
    fontSize: 16,
  },
  nativeVideoWrapper: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 24,
  },
  nativeVideo: {
    width: '100%',
    height: '100%',
  },
  listingBanner: {
    backgroundColor: '#E53935',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  listingBannerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  ctaButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 10,
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  ctaSubtext: {
    textAlign: 'center',
    color: '#999',
    fontSize: 13,
    marginBottom: 32,
  },
  divider: {
    height: 1,
    backgroundColor: '#ddd',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowLabel: {
    fontSize: 14,
    color: '#666',
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    maxWidth: '60%',
    textAlign: 'right',
  },
  hashCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  hashLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hashValue: {
    fontSize: 11,
    color: '#333',
    fontFamily: 'monospace',
  },
  errorIcon: {
    fontSize: 48,
    color: '#E53935',
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
});

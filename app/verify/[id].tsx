import { AutographPlayer } from '@/components/autograph-player';
import { buildCertificateHtml } from '@/lib/certificate-pdf';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Point = { x: number; y: number; t: number };
type Stroke = { id: string; points: Point[] };

type AutographRecord = {
  certificate_id: string;
  created_at: string;
  content_hash: string;
  video_url: string | null;
  thumbnail_url: string | null;
  preview_frame_urls: string[] | null;
  preview_frame_times_ms: number[] | null;
  strokes_json: Stroke[];
  capture_width: number;
  capture_height: number;
  stroke_color: string;
  template_id: string | null;
  is_for_sale: boolean;
  price_cents: number | null;
  creator_name: string;
  creator_verified: boolean;
  owner_name: string;
};

type ProvenanceEvent = {
  event_order: number;
  event_type: string;
  event_date: string;
  price_cents: number | null;
  from_label: string | null;
  to_label: string | null;
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

function formatEventType(type: string) {
  switch (type) {
    case 'signed': return 'Signed';
    case 'primary_sale':
    case 'secondary_sale': return 'Sold';
    case 'trade': return 'Traded';
    case 'gift': return 'Gifted';
    default: return 'Transferred';
  }
}

const TRUST_SIGNALS = [
  {
    title: 'Integrity Verified',
    detail: 'Ophinia hashes the uploaded media and autograph manifest on the backend to make tampering evident.',
  },
  {
    title: 'Server-Minted Certificate',
    detail: 'Certificate IDs and authenticity records are issued by Ophinia on the server, not by the device.',
  },
  {
    title: 'Creator Age Verified',
    detail: 'Ophinia requires creators to be 18 or older. Identity-verified creators are confirmed via Stripe Identity.',
  },
  {
    title: 'Ownership Chain Recorded',
    detail: 'Transfers are recorded server-side so collectors can inspect provenance.',
  },
  {
    title: 'Duplicate-Protected Minting',
    detail: 'Ophinia checks for duplicate media and stroke signatures before minting.',
  },
];

function WebVideoWithOverlay({ videoUrl, strokes, strokeColor, captureWidth, captureHeight, onCertificate }: {
  videoUrl: string;
  strokes: Stroke[];
  strokeColor: string;
  captureWidth: number;
  captureHeight: number;
  onCertificate: () => void;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);

  // Before playback begins, show the full signature. Once playing, animate in sync.
  const displayTime = hasStarted ? currentTime : Infinity;

  return (
    <div style={{ position: 'relative', width: '100%', marginBottom: 24, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
      <video
        src={videoUrl}
        controls
        style={{ width: '100%', display: 'block', maxHeight: 320 } as any}
        onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
        onPlay={() => setHasStarted(true)}
      />
      {/* viewBox matches capture dimensions + preserveAspectRatio mirrors browser video letterboxing */}
      <svg
        viewBox={`0 0 ${captureWidth} ${captureHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' } as any}
      >
        {strokes.map((stroke) => {
          const visible = stroke.points.filter((p) => p.t <= displayTime);
          if (!visible.length) return null;
          const d = visible.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          const isGold = strokeColor === '#F1C168';

          if (!isGold) {
            return (
              <path
                key={stroke.id}
                d={d}
                stroke={strokeColor}
                strokeWidth={5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
              />
            );
          }

          return (
            <g key={stroke.id}>
              <path d={d} stroke="#D9AF4C" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
              <path d={d} stroke="#FFF0A0" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.82} />
            </g>
          );
        })}
      </svg>
      {/* Ophina CoA button — identical position to AutographPlayer */}
      <div
        onClick={onCertificate}
        style={{
          position: 'absolute', bottom: 14, right: 14,
          backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10,
          paddingLeft: 16, paddingRight: 24, paddingTop: 8, paddingBottom: 8,
          cursor: 'pointer',
        } as any}
      >
        <span style={{ fontFamily: 'serif', color: '#E53935', fontSize: 30, lineHeight: '36px' } as any}>Ophinia</span>
      </div>
    </div>
  );
}

export default function VerifyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [record, setRecord] = useState<AutographRecord | null>(null);
  const [provenance, setProvenance] = useState<ProvenanceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;

    supabase
      .rpc('get_public_certificate', { p_certificate_id: id })
      .single()
      .then(({ data, error }) => {
        setLoading(false);
        if (error || !data) { setNotFound(true); return; }
        setRecord(data as any);
      });

    supabase
      .rpc('get_provenance_chain', { p_certificate_id: id })
      .then(({ data }) => {
        if (data) setProvenance(data as ProvenanceEvent[]);
      });
  }, [id]);

  const [exporting, setExporting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const coaOffset = useRef<number>(0);

  const exportPdf = async () => {
    if (!record) return;
    setExporting(true);
    const appUrl = process.env.EXPO_PUBLIC_APP_URL ?? 'https://tapnsign.app';
    const verifyUrl = `${appUrl}/verify/${record.certificate_id}`;
    try {
      if (Platform.OS === 'web') {
        const html = await buildCertificateHtml({
          creatorName: record.creator_name,
          creatorVerified: record.creator_verified,
          ownerName: record.owner_name,
          createdAt: record.created_at,
          certificateId: record.certificate_id,
          contentHash: record.content_hash,
          thumbnailUrl: record.thumbnail_url,
          verifyUrl,
          provenance,
        });
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.print();
        }
      } else {
        // On native, open the web verify page in the browser so the user
        // can use the browser's print/save-to-PDF tools.
        await Linking.openURL(verifyUrl);
      }
    } catch {
      Alert.alert('Export failed', 'Could not generate the certificate PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

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
  const listingLabel = r.is_for_sale
    ? `For Sale · ${formatPrice(r.price_cents ?? 0)}`
    : null;

  const appUrl = process.env.EXPO_PUBLIC_APP_URL ?? 'https://tapnsign.app';
  const pageUrl = `${appUrl}/verify/${r.certificate_id}`;
  const ogTitle = `${r.creator_name} · Verified Autograph`;
  const ogDescription = r.is_for_sale
    ? `Authenticated signature captured on Ophinia. ${listingLabel} — tap to verify or purchase.`
    : `Authenticated signature captured on Ophinia. Tap to verify certificate of authenticity.`;
  const ogImage = r.thumbnail_url ?? `${appUrl}/assets/images/icon.png`;

  return (
    <>
    <Head>
      <title>{ogTitle}</title>
      <meta name="description" content={ogDescription} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:title" content={ogTitle} />
      <meta property="og:description" content={ogDescription} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="Ophinia" />

      {/* Twitter / X card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={ogTitle} />
      <meta name="twitter:description" content={ogDescription} />
      <meta name="twitter:image" content={ogImage} />
    </Head>
    <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brandName}>Ophinia</Text>
        <View style={styles.verifiedBadge}>
          <Text style={styles.verifiedBadgeText}>✓ Verified Autograph</Text>
        </View>
      </View>

      {/* Celebrity name */}
      <Text style={styles.creatorName}>{r.creator_name}</Text>
      <Text style={styles.capturedDate}>Captured {formatDateTime(r.created_at)}</Text>

      {/* Video player with signature overlay + Ophina CoA button */}
      {Platform.OS === 'web' && r.video_url ? (
        <WebVideoWithOverlay
          videoUrl={r.video_url}
          strokes={r.strokes_json ?? []}
          strokeColor={r.stroke_color ?? '#001B5C'}
          captureWidth={r.capture_width}
          captureHeight={r.capture_height}
          onCertificate={() => scrollRef.current?.scrollTo({ y: coaOffset.current, animated: true })}
        />
      ) : (
        <View style={styles.nativeVideoWrapper}>
          <AutographPlayer
            videoUrl={r.video_url}
            thumbnailUrl={r.thumbnail_url}
            previewFrameUrls={r.preview_frame_urls ?? []}
            previewFrameTimesMs={r.preview_frame_times_ms ?? []}
            templateId={r.template_id ?? 'classic'}
            strokes={r.strokes_json ?? []}
            strokeColor={r.stroke_color ?? '#001B5C'}
            captureWidth={r.capture_width}
            captureHeight={r.capture_height}
            hintText="Tap for certificate of authenticity"
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
              {r.is_for_sale ? 'Buy on Ophinia' : 'View on Ophinia'}
            </Text>
          </Pressable>
          <Text style={styles.ctaSubtext}>
            Download the Ophinia app to {r.is_for_sale ? 'purchase this autograph' : 'view this autograph'}.
          </Text>
        </>
      )}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Certificate details */}
      <Text
        style={styles.sectionTitle}
        onLayout={(e) => { coaOffset.current = e.nativeEvent.layout.y; }}
      >Certificate of Authenticity</Text>

      <View style={styles.card}>
        <Row label="Signed by" value={r.creator_name} />
        <Row label="Creator Identity" value={r.creator_verified ? 'Identity Verified' : 'Unverified'} />
        <Row label="Current Owner" value={r.owner_name} />
        <Row label="Date Captured" value={formatDateTime(r.created_at)} />
      </View>

      <View style={styles.hashCard}>
        <Text style={styles.hashLabel}>Certificate ID</Text>
        <Text style={styles.hashValue}>{r.certificate_id}</Text>
        <Text style={[styles.hashLabel, { marginTop: 12 }]}>Content Hash (SHA-256)</Text>
        <Text style={styles.hashValue}>{r.content_hash}</Text>
      </View>

      <View style={styles.trustCard}>
        <Text style={styles.trustTitle}>Collector Protection</Text>
        {TRUST_SIGNALS.map((signal, index) => (
          <View
            key={signal.title}
            style={[styles.trustRow, index < TRUST_SIGNALS.length - 1 && styles.trustRowBorder]}
          >
            <Text style={styles.trustCheck}>✓</Text>
            <View style={styles.trustCopy}>
              <Text style={styles.trustLabel}>{signal.title}</Text>
              <Text style={styles.trustDetail}>{signal.detail}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Export certificate */}
      <Pressable
        style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
        onPress={exportPdf}
        disabled={exporting}
      >
        <Text style={styles.exportButtonText}>
          {exporting ? 'Opening…' : Platform.OS === 'web' ? 'Download Certificate PDF' : 'Open Certificate in Browser'}
        </Text>
      </Pressable>

      {/* Provenance chain */}
      {provenance.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Provenance</Text>
          <View style={styles.provenanceCard}>
            {provenance.map((evt, idx) => (
              <View key={evt.event_order} style={[styles.provenanceRow, idx < provenance.length - 1 && styles.provenanceRowBorder]}>
                <View style={styles.provenanceDot} />
                <View style={styles.provenanceContent}>
                  <View style={styles.provenanceTopRow}>
                    <Text style={styles.provenanceType}>{formatEventType(evt.event_type)}</Text>
                    {evt.price_cents != null && (
                      <Text style={styles.provenancePrice}>{formatPrice(evt.price_cents)}</Text>
                    )}
                    <Text style={styles.provenanceDate}>{formatDateTime(evt.event_date)}</Text>
                  </View>
                  <Text style={styles.provenanceParties}>
                    {evt.from_label ? `${evt.from_label} → ${evt.to_label}` : evt.to_label}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

    </ScrollView>
    </>
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
  creatorName: {
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
  trustCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 16,
  },
  trustTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  trustRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  trustCheck: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F8A4B',
    marginTop: 1,
  },
  trustCopy: {
    flex: 1,
  },
  trustLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    marginBottom: 2,
  },
  trustDetail: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
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
  provenanceCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  provenanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
  },
  provenanceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  provenanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E53935',
    marginTop: 5,
    marginRight: 12,
    flexShrink: 0,
  },
  provenanceContent: {
    flex: 1,
  },
  provenanceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 3,
  },
  provenanceType: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
  },
  provenancePrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E53935',
  },
  provenanceDate: {
    fontSize: 12,
    color: '#999',
    marginLeft: 'auto',
  },
  provenanceParties: {
    fontSize: 13,
    color: '#555',
  },
  exportButton: {
    borderWidth: 1.5,
    borderColor: '#E53935',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  exportButtonDisabled: {
    borderColor: '#ccc',
  },
  exportButtonText: {
    color: '#E53935',
    fontSize: 15,
    fontWeight: '600',
  },
});

import { BrandFonts } from '@/constants/theme';
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type CertificateSheetProps = {
  title?: string;
  signedBy: string;
  dateCaptured: string;
  certificateId: string;
  edition?: string | null;
  currentOwner?: string | null;
  primaryActionLabel?: string | null;
  onPrimaryAction?: (() => void) | null;
  onClose: () => void;
  extra?: ReactNode;
};

export function CertificateSheet({
  title = 'Certificate of Authenticity',
  signedBy,
  dateCaptured,
  certificateId,
  edition,
  currentOwner,
  primaryActionLabel,
  onPrimaryAction,
  onClose,
  extra,
}: CertificateSheetProps) {
  const trustSignals = [
    {
      title: 'Integrity Verified',
      detail: 'Media and autograph manifest are hashed server-side to make tampering evident.',
    },
    {
      title: 'Server-Minted Certificate',
      detail: 'Certificate IDs are issued by TapnSign on the backend, not generated on-device.',
    },
    {
      title: 'Original Creator Verified',
      detail: 'Only verified creators can mint new TapnSign autographs.',
    },
    {
      title: 'Ownership Chain Recorded',
      detail: 'Transfers are recorded server-side so collectors can review provenance.',
    },
    {
      title: 'Duplicate-Protected Minting',
      detail: 'TapnSign checks for duplicate media and stroke signatures before minting.',
    },
  ];

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.frame} pointerEvents="box-none">
        <ScrollView style={styles.scroll} contentContainerStyle={styles.sheet}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Signed By</Text>
            <Text style={styles.value}>{signedBy}</Text>
          </View>
          {currentOwner ? (
            <View style={styles.row}>
              <Text style={styles.label}>Current Owner</Text>
              <Text style={styles.value}>{currentOwner}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.label}>Date Captured</Text>
            <Text style={styles.value}>{dateCaptured}</Text>
          </View>
          {edition ? (
            <View style={styles.row}>
              <Text style={styles.label}>Edition</Text>
              <Text style={styles.value}>{edition}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.label}>Certificate ID</Text>
            <Text style={styles.idValue}>{certificateId}</Text>
          </View>

          <View style={styles.trustCard}>
            <Text style={styles.trustTitle}>Collector Protection</Text>
            {trustSignals.map((signal, index) => (
              <View
                key={signal.title}
                style={[styles.trustRow, index < trustSignals.length - 1 && styles.trustRowBorder]}
              >
                <Text style={styles.trustCheck}>✓</Text>
                <View style={styles.trustCopy}>
                  <Text style={styles.trustLabel}>{signal.title}</Text>
                  <Text style={styles.trustDetail}>{signal.detail}</Text>
                </View>
              </View>
            ))}
          </View>

          {extra}

          {primaryActionLabel && onPrimaryAction ? (
            <Pressable style={[styles.button, { marginTop: 20 }]} onPress={onPrimaryAction}>
              <Text style={styles.buttonText}>{primaryActionLabel}</Text>
            </Pressable>
          ) : null}

          <Pressable style={[styles.button, { marginTop: primaryActionLabel && onPrimaryAction ? 10 : 20 }]} onPress={onClose}>
            <Text style={styles.buttonText}>Done</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  frame: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    alignSelf: 'center',
  },
  scroll: {
    width: '100%',
  },
  sheet: {
    flexGrow: 0,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: {
    fontSize: 13,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
    fontFamily: BrandFonts.primary,
    maxWidth: '60%',
    textAlign: 'right',
  },
  idValue: {
    fontSize: 11,
    color: '#333',
    fontFamily: 'monospace',
    maxWidth: '60%',
    textAlign: 'right',
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  trustCard: {
    width: '100%',
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  trustTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  trustRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E6',
  },
  trustCheck: {
    fontSize: 14,
    color: '#0F8A4B',
    fontWeight: '800',
    fontFamily: BrandFonts.primary,
    marginTop: 1,
  },
  trustCopy: {
    flex: 1,
  },
  trustLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    marginBottom: 2,
  },
  trustDetail: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
    fontFamily: BrandFonts.primary,
  },
});

import { BrandColors, BrandFonts } from '@/constants/theme';
import { AddressDetails, AddressSheet } from '@stripe/stripe-react-native';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

type PrintPreview = {
  next_print_sequence_number: number;
  print_layout_url?: string | null;
};

type PrintItem = {
  creatorName: string | null;
  creatorSequenceNumber: number | null;
  createdAt: string;
  seriesName: string | null;
};

type Props = {
  visible: boolean;
  printItem: PrintItem | null;
  printPreview: PrintPreview | null;
  printStep: 'preview' | 'processing';
  addressSheetVisible: boolean;
  creatingPrint: boolean;
  onClose: () => void;
  onProceedToPayment: () => void;
  onAddressSubmit: (address: AddressDetails) => void;
  onAddressError: () => void;
  formatCardDate: (value: string) => string;
};

function buildOptimizedPrintPreviewUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.searchParams.set('width', '900');
    url.searchParams.set('quality', '75');
    return url.toString();
  } catch {
    return value;
  }
}

export function AutographPrintModal({
  visible,
  printItem,
  printPreview,
  printStep,
  addressSheetVisible,
  creatingPrint,
  onClose,
  onProceedToPayment,
  onAddressSubmit,
  onAddressError,
  formatCardDate,
}: Props) {
  const { width } = useWindowDimensions();
  const [previewImageMode, setPreviewImageMode] = useState<'optimized' | 'original' | 'fallback'>('optimized');
  const previewImageWidth = Math.min(width - 84, 304);
  const previewImageHeight = Math.round(previewImageWidth * 1.25);
  const previewCardWidth = previewImageWidth + 36;
  const remotePreviewUrl = printPreview?.print_layout_url ?? null;
  const optimizedPreviewUrl = buildOptimizedPrintPreviewUrl(remotePreviewUrl);
  const displayedPreviewUrl =
    previewImageMode === 'optimized' ? optimizedPreviewUrl :
    previewImageMode === 'original' ? remotePreviewUrl :
    null;
  const previewSource = displayedPreviewUrl
    ? { uri: displayedPreviewUrl }
    : require('../assets/images/print_preview.png');

  useEffect(() => {
    setPreviewImageMode('optimized');
  }, [remotePreviewUrl]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <Pressable style={styles.sellSheetOverlay} onPress={printStep === 'processing' ? undefined : onClose}>
        <ScrollView
          style={{ width: '100%' }}
          contentContainerStyle={styles.printSheet}
          onStartShouldSetResponder={() => true}
        >
          {printItem && printPreview ? (
            <>
              {printStep === 'preview' && (
                <>
                  <Text style={styles.certTitle}>Print Autograph</Text>
                  <Text style={styles.previewLabel}>Print layout preview</Text>

                  <View style={[styles.previewFrame, { width: previewCardWidth }]}>
                    <Image
                      source={previewSource}
                      style={[styles.printPreviewImage, { width: previewImageWidth, height: previewImageHeight }]}
                      resizeMode="contain"
                      onError={(event) => {
                        if (previewImageMode === 'optimized' && remotePreviewUrl) {
                          console.warn('[AutographPrintModal] optimized print preview image failed to load', {
                            url: optimizedPreviewUrl,
                            error: event.nativeEvent.error,
                          });
                          setPreviewImageMode('original');
                          return;
                        }
                        if (previewImageMode === 'original' && remotePreviewUrl) {
                          console.warn('[AutographPrintModal] print preview image failed to load', {
                            url: remotePreviewUrl,
                            error: event.nativeEvent.error,
                          });
                          setPreviewImageMode('fallback');
                        }
                      }}
                    />
                    <View pointerEvents="none" style={[styles.previewWatermark, { width: previewImageWidth, height: previewImageHeight }]}>
                      <View style={styles.previewWatermarkBand}>
                        <Text style={styles.previewWatermarkText}>PREVIEW</Text>
                      </View>
                      <Text style={styles.previewWatermarkFooter}>Official print preview</Text>
                    </View>
                  </View>

                  <Text style={styles.printInfoText}>
                    Official 8×10 memorabilia print.
                  </Text>
                  <Pressable
                    style={[styles.certCloseButton, { marginTop: 8 }]}
                    onPress={onProceedToPayment}
                    disabled={creatingPrint}
                  >
                    <Text style={styles.closeButtonText}>Order Print - $19.95</Text>
                  </Pressable>

                  <Pressable onPress={onClose} style={{ marginTop: 20 }}>
                    <Text style={styles.certDate}>Close</Text>
                  </Pressable>
                </>
              )}

              {printStep === 'processing' && (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Text style={styles.certTitle}>Processing…</Text>
                  <Text style={styles.printInfoText}>Please do not close this screen.</Text>
                </View>
              )}

              <AddressSheet
                visible={addressSheetVisible}
                onSubmit={onAddressSubmit}
                onError={onAddressError}
                defaultValues={{ name: '', address: { country: 'US' } }}
                additionalFields={{ phoneNumber: 'hidden' }}
                allowedCountries={['US']}
                primaryButtonTitle="Continue to Payment"
                appearance={{ colors: { primary: '#FA0909' } }}
              />
            </>
          ) : null}
        </ScrollView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sellSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    paddingTop: 50,
  },
  printSheet: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 32,
    paddingBottom: 28,
    backgroundColor: BrandColors.background,
  },
  certTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    marginBottom: 4,
  },
  certDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    fontFamily: BrandFonts.primary,
  },
  previewLabel: {
    fontSize: 13,
    color: '#666',
    fontFamily: BrandFonts.primary,
    marginTop: 14,
    marginBottom: 8,
  },
  previewFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  printPreviewImage: {
    alignSelf: 'center',
    borderRadius: 0,
  },
  previewWatermark: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewWatermarkBand: {
    width: '150%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(0,27,92,0.35)',
    transform: [{ rotate: '-28deg' }],
  },
  previewWatermarkText: {
    color: '#001B5C',
    fontFamily: BrandFonts.primary,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },
  previewWatermarkFooter: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,27,92,0.82)',
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  printInfoText: {
    maxWidth: 380,
    marginTop: 30,
    fontSize: 13,
    lineHeight: 18,
    color: '#555',
    textAlign: 'center',
    fontFamily: BrandFonts.primary,
  },
  certCloseButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  closeButtonText: {
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
    fontSize: 16,
  },
});

import { BrandColors, BrandFonts } from '@/constants/theme';
import { AddressDetails, AddressSheet } from '@stripe/stripe-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

type PrintPreview = {
  next_print_sequence_number: number;
  print_layout_url?: string | null;
  print_preview_url?: string | null;
};

type PrintItem = {
  creatorName: string | null;
  creatorSequenceNumber: number | null;
  createdAt: string;
  seriesName: string | null;
};

const MAX_QUANTITY = 5;

type Props = {
  visible: boolean;
  printItem: PrintItem | null;
  printItems?: PrintItem[];
  printPreview: PrintPreview | null;
  printStep: 'preview' | 'processing';
  addressSheetVisible: boolean;
  creatingPrint: boolean;
  loadingPrintPreview?: boolean;
  quantity: number;
  unitPriceCents?: number;
  originalPriceCents?: number;
  shippingCents?: number;
  onQuantityChange: (qty: number) => void;
  onClose: () => void;
  onProceedToPayment: () => void;
  onAddressSubmit: (address: AddressDetails) => void;
  onAddressError: () => void;
  formatCardDate: (value: string) => string;
};

export function AutographPrintModal({
  visible,
  printItem,
  printItems,
  printPreview,
  printStep,
  addressSheetVisible,
  creatingPrint,
  loadingPrintPreview = false,
  quantity,
  unitPriceCents = 1000,
  originalPriceCents = 1000,
  shippingCents = 699,
  onQuantityChange,
  onClose,
  onProceedToPayment,
  onAddressSubmit,
  onAddressError,
  formatCardDate,
}: Props) {
  const selectedPrintItems = printItems?.length ? printItems : printItem ? [printItem] : [];
  const isBundle = selectedPrintItems.length > 1;
  const effectiveQuantity = isBundle ? selectedPrintItems.length : quantity;
  const isOnSale = unitPriceCents < originalPriceCents;
  const totalCents = (unitPriceCents * effectiveQuantity) + shippingCents;
  const totalDisplay = `$${(totalCents / 100).toFixed(2)}`;
  const unitDisplay = `$${(unitPriceCents / 100).toFixed(2)}`;
  const shippingDisplay = `$${(shippingCents / 100).toFixed(2)}`;
  const { width } = useWindowDimensions();
  const [urlFallbackIndex, setUrlFallbackIndex] = useState(0);
  const previewImageWidth = Math.min(width - 84, 304);
  const previewCardWidth = previewImageWidth + 36;
  const printPreviewUrl = printPreview?.print_preview_url ?? null;
  const printLayoutUrl = printPreview?.print_layout_url ?? null;
  const orderedUrls = [printPreviewUrl, printLayoutUrl].filter((u): u is string => !!u);
  const currentUrl = orderedUrls[urlFallbackIndex] ?? null;

  useEffect(() => {
    setUrlFallbackIndex(0);
  }, [printPreviewUrl, printLayoutUrl]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <Pressable style={styles.sellSheetOverlay} onPress={printStep === 'processing' ? undefined : onClose}>
        <Pressable onPress={() => {}} style={{ width: '100%' }}>
        <ScrollView
          style={{ width: '100%' }}
          contentContainerStyle={styles.printSheet}
        >
          {selectedPrintItems.length > 0 ? (
            <>
              {printStep === 'preview' && (
                <>
                  <Text style={styles.certTitle}>{isBundle ? 'Print Selected Moments' : 'Print Moment'}</Text>
                  <Text style={styles.previewLabel}>{isBundle ? `${selectedPrintItems.length} selected prints` : 'Print layout preview'}</Text>

                  <View style={[styles.previewFrame, { width: previewCardWidth }]}>
                    {currentUrl ? (
                      <Image
                        source={{ uri: currentUrl }}
                        style={[styles.printPreviewImage, { width: previewImageWidth, aspectRatio: 5/4 }]}
                        resizeMode="cover"
                        onError={(event) => {
                          console.warn('[AutographPrintModal] print preview image failed to load', {
                            url: currentUrl,
                            error: event.nativeEvent.error,
                          });
                          setUrlFallbackIndex(prev => prev + 1);
                        }}
                      />
                    ) : (
                      <View style={[styles.printPreviewLoadingPanel, { width: previewImageWidth, aspectRatio: 5/4 }]}>
                        <ActivityIndicator color="#001B5C" />
                      </View>
                    )}
                  </View>

                  <Text style={styles.printInfoText}>
                    {loadingPrintPreview
                      ? 'Preparing your official print preview.'
                      : isBundle
                        ? 'Official 8×10 memorabilia prints. One copy of each selected moment ships together.'
                        : 'Official 8×10 memorabilia print.'}
                  </Text>
                  {loadingPrintPreview ? (
                    <ActivityIndicator color="#111" style={{ marginTop: 12 }} />
                  ) : null}

                  {isBundle ? (
                    <View style={styles.bundleList}>
                      {selectedPrintItems.map((item, index) => (
                        <Text key={`${item.creatorSequenceNumber ?? index}-${item.createdAt}`} style={styles.bundleListItem} numberOfLines={1}>
                          {item.creatorSequenceNumber != null ? `#${item.creatorSequenceNumber}` : `Print ${index + 1}`}
                          {item.seriesName ? ` · ${item.seriesName}` : ''}
                        </Text>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.quantityRow}>
                      <Pressable
                        style={[styles.qtyButton, quantity <= 1 && styles.qtyButtonDisabled]}
                        onPress={() => { if (quantity > 1) onQuantityChange(quantity - 1); }}
                      >
                        <Text style={styles.qtyButtonText}>−</Text>
                      </Pressable>
                      <Text style={styles.qtyValue}>{quantity}</Text>
                      <Pressable
                        style={[styles.qtyButton, quantity >= MAX_QUANTITY && styles.qtyButtonDisabled]}
                        onPress={() => { if (quantity < MAX_QUANTITY) onQuantityChange(quantity + 1); }}
                      >
                        <Text style={styles.qtyButtonText}>+</Text>
                      </Pressable>
                    </View>
                  )}
                  {isOnSale && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <View style={{ backgroundColor: '#FEE2E2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: '#DC2626', fontSize: 11, fontWeight: '800', fontFamily: BrandFonts.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {Math.round((1 - unitPriceCents / originalPriceCents) * 100)}% OFF
                        </Text>
                      </View>
                      <Text style={{ color: '#9CA3AF', fontSize: 12, fontFamily: BrandFonts.primary, textDecorationLine: 'line-through' }}>
                        ${(originalPriceCents / 100).toFixed(2)}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.priceLine}>
                    {effectiveQuantity > 1
                      ? `${unitDisplay} × ${effectiveQuantity} + ${shippingDisplay} shipping = ${totalDisplay}`
                      : `${unitDisplay} + ${shippingDisplay} shipping = ${totalDisplay}`}
                  </Text>
                  {isOnSale && (
                    <Text style={{ color: '#16A34A', fontSize: 12, fontFamily: BrandFonts.primary, fontWeight: '600', marginTop: 2 }}>
                      You save ${(((originalPriceCents - unitPriceCents) * effectiveQuantity) / 100).toFixed(2)}
                    </Text>
                  )}

                  <Pressable
                    style={[
                      styles.certCloseButton,
                      { marginTop: 8 },
                      (!printPreview || loadingPrintPreview || creatingPrint) && styles.certCloseButtonDisabled,
                    ]}
                    onPress={onProceedToPayment}
                    disabled={!printPreview || loadingPrintPreview || creatingPrint}
                  >
                    <Text style={styles.closeButtonText}>
                      {loadingPrintPreview ? 'Preparing Preview…' : `Order Print${effectiveQuantity > 1 ? 's' : ''}`}
                    </Text>
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
                appearance={{ colors: { primary: '#001B5C' } }}
              />
            </>
          ) : null}
        </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sellSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  printSheet: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    backgroundColor: BrandColors.background,
    borderRadius: 16,
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
    marginTop: 6,
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
  printPreviewLoadingPanel: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f0ea',
    borderWidth: 1,
    borderColor: '#ded8cb',
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
  certCloseButtonDisabled: {
    opacity: 0.45,
  },
  closeButtonText: {
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
    fontSize: 16,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 20,
  },
  qtyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BrandColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonDisabled: {
    opacity: 0.3,
  },
  qtyButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 24,
  },
  qtyValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    minWidth: 24,
    textAlign: 'center',
  },
  bundleList: {
    width: '100%',
    maxWidth: 320,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#E4E0D8',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  bundleListItem: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  priceLine: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: BrandColors.primary,
    fontFamily: BrandFonts.primary,
  },
});

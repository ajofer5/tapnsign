import { AutographPlayer } from '@/components/autograph-player';
import { CardMetadataBlock } from '@/components/card-metadata-block';
import { CertificateSheet } from '@/components/certificate-sheet';
import { NameWithSequence } from '@/components/public-video-card';
import { PublicVideoThumbnail } from '@/components/public-video-thumbnail';
import { BrandColors, BrandFonts } from '@/constants/theme';
import { fetchAutographTemplateIds } from '@/lib/autograph-template';
import { callEdgeFunction } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { buildAutographUrl } from '@/lib/public-links';
import { supabase } from '@/lib/supabase';
import { useStripe } from '@stripe/stripe-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
type Point = {
  x: number;
  y: number;
  t: number;
};

type Stroke = {
  id: string;
  points: Point[];
};

type AutograpshFilters = {
  creator: string;
  series: string;
  listed: boolean;
  unlisted: boolean;
};

const defaultAutographFilters: AutograpshFilters = {
  creator: '',
  series: '',
  listed: false,
  unlisted: false,
};

type AutographSort = 'newest' | 'oldest';

type AutographItem = {
  id: string;
  creatorId: string;
  certificateId: string;
  createdAt: string;
  videoUri: string | null;
  previewFrameUrls: string[];
  previewFrameTimesMs: number[];
  thumbnailUrl: string | null;
  strokes: Stroke[];
  captureWidth?: number;
  captureHeight?: number;
  visibility: 'private' | 'public';
  saleState: 'not_for_sale' | 'fixed';
  listingMode: 'buy_now' | 'make_offer';
  isForSale: boolean;
  priceCents: number | null;
  openToTrade: boolean;
  autoDeclineBelow: boolean;
  autoAcceptAbove: boolean;
  strokeColor: string;
  templateId?: string | null;
  creatorName: string | null;
  creatorNameVerified: boolean;
  creatorSequenceNumber: number | null;
  seriesName: string | null;
  seriesSequenceNumber: number | null;
  seriesMaxSize: number | null;
  seriesId: string | null;
  printCount: number | null;
};

type IncomingOfferItem = {
  id: string;
  autographId: string;
  creatorName: string;
  creatorSequenceNumber: number | null;
  amountCents: number;
  status: 'pending' | 'accepted' | 'on_hold';
  expiresAt: string | null;
  paymentDueAt: string | null;
  createdAt: string;
};

type PrintPreview = {
  autograph_id: string;
  total_print_count: number;
  next_print_sequence_number: number;
  next_print_label: string;
  owner_print_count: number;
  latest_owner_print: {
    id: string;
    print_sequence_number: number;
    print_label: string;
    created_at: string;
  } | null;
  item_cents: number | null;
  shipping_cents: number | null;
};

type OwnedListingRow = {
  id: string;
  creator_id: string;
  owner_id: string;
  certificate_id: string;
  created_at: string;
  thumbnail_url: string | null;
  video_url: string | null;
  preview_frame_urls: string[] | null;
  preview_frame_times_ms: number[] | null;
  strokes_json: Stroke[] | null;
  capture_width: number | null;
  capture_height: number | null;
  stroke_color: string | null;
  template_id?: string | null;
  creator_display_name: string | null;
  creator_name_verified: boolean | null;
  creator_sequence_number: number | null;
  series_name: string | null;
  series_sequence_number: number | null;
  series_max_size: number | null;
  sale_state: 'not_for_sale' | 'fixed' | null;
  listing_mode: 'buy_now' | 'make_offer' | null;
  is_for_sale: boolean | null;
  price_cents: number | null;
  auto_decline_below: boolean | null;
  auto_accept_above: boolean | null;
  offer_locked_until: string | null;
  print_count: number | null;
};

type OfferQueueRow = {
  autograph_id: string;
  offer_id: string;
  amount_cents: number;
  status: 'pending' | 'accepted' | 'on_hold';
  expires_at: string | null;
  payment_due_at: string | null;
  created_at: string;
  creator_name: string | null;
  creator_sequence_number: number | null;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTimeWithClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCardDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
}

function formatSeriesEdition(item: Pick<AutographItem, 'seriesSequenceNumber' | 'seriesMaxSize'>) {
  if (item.seriesSequenceNumber != null && item.seriesMaxSize != null) {
    return `${item.seriesSequenceNumber} of ${item.seriesMaxSize}`;
  }
  return null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return fallback;
}

function mapOwnedListingRow(row: OwnedListingRow): AutographItem {
  return {
    id: row.id,
    creatorId: row.creator_id,
    certificateId: row.certificate_id,
    createdAt: row.created_at,
    videoUri: row.video_url ?? null,
    previewFrameUrls: row.preview_frame_urls ?? [],
    previewFrameTimesMs: row.preview_frame_times_ms ?? [],
    thumbnailUrl: row.thumbnail_url ?? null,
    strokes: row.strokes_json ?? [],
    captureWidth: row.capture_width ?? undefined,
    captureHeight: row.capture_height ?? undefined,
    visibility: 'public',
    saleState: row.sale_state ?? (row.is_for_sale ? 'fixed' : 'not_for_sale'),
    listingMode: row.listing_mode === 'buy_now' ? 'buy_now' : 'make_offer',
    isForSale: !!row.is_for_sale,
    priceCents: row.price_cents ?? null,
    openToTrade: false,
    autoDeclineBelow: !!row.auto_decline_below,
    autoAcceptAbove: !!row.auto_accept_above,
    strokeColor: row.stroke_color ?? '#001B5C',
    templateId: row.template_id ?? null,
    creatorName: row.creator_display_name ?? null,
    creatorNameVerified: !!row.creator_name_verified,
    creatorSequenceNumber: row.creator_sequence_number ?? null,
    seriesName: row.series_name ?? null,
    seriesSequenceNumber: row.series_sequence_number ?? null,
    seriesMaxSize: row.series_max_size ?? null,
    seriesId: null,
    printCount: row.print_count ?? null,
  };
}

function mapOfferQueueRow(row: OfferQueueRow): IncomingOfferItem {
  return {
    id: row.offer_id,
    autographId: row.autograph_id,
    creatorName: row.creator_name ?? 'Unknown',
    creatorSequenceNumber: row.creator_sequence_number ?? null,
    amountCents: row.amount_cents,
    status: row.status,
    expiresAt: row.expires_at ?? null,
    paymentDueAt: row.payment_due_at ?? null,
    createdAt: row.created_at,
  };
}

export default function AutographsScreen() {
  const router = useRouter();
  const [data, setData] = useState<AutographItem[]>([]);
  const [incomingOffers, setIncomingOffers] = useState<IncomingOfferItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<AutographItem | null>(null);
  const [certItem, setCertItem] = useState<AutographItem | null>(null);
  const [sellItems, setSellItems] = useState<AutographItem[]>([]);
  const [listingMode, setListingMode] = useState<'buy_now' | 'make_offer'>('buy_now');
  const [priceInput, setPriceInput] = useState('');
  const [autoDeclineBelow, setAutoDeclineBelow] = useState(false);
  const [autoAcceptAbove, setAutoAcceptAbove] = useState(false);

  // Formats a cents-as-string value to "X.XX" display string
  const formatCentsInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    const cents = parseInt(digits, 10);
    return (cents / 100).toFixed(2);
  };
  const handlePriceChange = (text: string) => setPriceInput(formatCentsInput(text));
  const [saving, setSaving] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [filters, setFilters] = useState<AutograpshFilters>(defaultAutographFilters);
  const [draftFilters, setDraftFilters] = useState<AutograpshFilters>(defaultAutographFilters);
  const [sort, setSort] = useState<AutographSort>('newest');
  const [draftSort, setDraftSort] = useState<AutographSort>('newest');
  const [seriesNameInput, setSeriesNameInput] = useState('');
  const [seriesSelectionMode, setSeriesSelectionMode] = useState(false);
  const [seriesSheetVisible, setSeriesSheetVisible] = useState(false);
  const [seriesSaving, setSeriesSaving] = useState(false);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [offerActioningId, setOfferActioningId] = useState<string | null>(null);
  const [printItem, setPrintItem] = useState<AutographItem | null>(null);
  const [printPreview, setPrintPreview] = useState<PrintPreview | null>(null);
  const [loadingPrintPreview, setLoadingPrintPreview] = useState(false);
  const [creatingPrint, setCreatingPrint] = useState(false);
  const [printSessionKey, setPrintSessionKey] = useState('');

  // Print order flow
  const [printStep, setPrintStep] = useState<'preview' | 'shipping' | 'processing'>('preview');
  const [shippingName, setShippingName] = useState('');
  const [shippingLine1, setShippingLine1] = useState('');
  const [shippingLine2, setShippingLine2] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('');
  const [shippingZip, setShippingZip] = useState('');

  // Damage claim flow
  const [damageClaim, setDamageClaim] = useState<{
    printId: string;
    autographId: string;
    step: 'intro' | 'photos' | 'submitted' | 'destruction' | 'done';
    claimId: string | null;
    frontPhotoUri: string | null;
    backPhotoUri: string | null;
    destructionPhotoUri: string | null;
    submitting: boolean;
  } | null>(null);

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { user } = useAuth();

  const closeSellSheet = () => {
    setSellItems([]);
    setListingMode('buy_now');
    setPriceInput('');
    setAutoDeclineBelow(false);
    setAutoAcceptAbove(false);
  };

  const openSellSheet = (items: AutographItem[]) => {
    setSellItems(items);

    if (items.length === 1) {
      const item = items[0];
      setListingMode(item.isForSale ? item.listingMode : 'buy_now');
      setPriceInput(item.priceCents != null ? (item.priceCents / 100).toFixed(2) : '');
      setAutoDeclineBelow(item.isForSale ? item.autoDeclineBelow : false);
      setAutoAcceptAbove(item.isForSale ? item.autoAcceptAbove : false);
      return;
    }

    setListingMode('buy_now');
    setPriceInput('');
    setAutoDeclineBelow(false);
    setAutoAcceptAbove(false);
  };

  const handleListForSale = async () => {
    if (sellItems.length === 0) return;

    const dollars = parseFloat(priceInput);
    if (isNaN(dollars) || dollars < 5) {
      Alert.alert('Invalid price', 'Estimated value must be at least $5.00.');
      return;
    }
    setSaving(true);
    const priceCents = Math.round(dollars * 100);
    let failed = 0;
    let firstError: string | null = null;
    for (const item of sellItems) {
      try {
        await callEdgeFunction('create-listing', {
          autograph_id: item.id,
          price_cents: priceCents,
          listing_mode: listingMode,
          open_to_trade: false,
          auto_decline_below: autoDeclineBelow,
          auto_accept_above: autoAcceptAbove,
        });
        setData((prev) => prev.map((i) =>
          i.id === item.id
            ? { ...i, visibility: 'public', saleState: 'fixed', listingMode, isForSale: true, priceCents, openToTrade: false }
            : i
        ));
      } catch (error) {
        failed++;
        if (!firstError) {
          firstError = error instanceof Error ? error.message : 'Unknown error';
        }
      }
    }
    setSaving(false);
    closeSellSheet();
    const succeeded = sellItems.length - failed;
    if (failed > 0) {
      const message = `${succeeded} listed, ${failed} failed.`;
      Alert.alert('Partially listed', firstError ? `${message}\n\n${firstError}` : message);
    } else {
      const listingDescription = listingMode === 'buy_now'
        ? `at a fixed price of $${dollars.toFixed(2)} each`
        : `with an estimated value of $${dollars.toFixed(2)} each`;
      Alert.alert('Listed!', `${succeeded} autograph${succeeded !== 1 ? 's' : ''} listed ${listingDescription}.`);
    }
  };

  const handleRemoveFromSale = (item: AutographItem) => {
    Alert.alert(
      'Remove Listing',
      'Remove this autograph from the marketplace and keep it in your collection?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Listing',
          style: 'destructive',
          onPress: async () => {
            try {
              await callEdgeFunction('remove-listing', { autograph_id: item.id });
              setData((prev) => prev.map((i) =>
                i.id === item.id
                  ? { ...i, saleState: 'not_for_sale', listingMode: 'make_offer', isForSale: false, priceCents: null, openToTrade: false }
                  : i
              ));
            } catch {
              Alert.alert('Error', 'Could not unlist. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleDelete = (item: AutographItem) => {
    // Listed or open to trade — must unlist first
    if (item.isForSale || item.openToTrade) {
      Alert.alert(
        'Unlist First',
        'Please unlist this autograph before deleting it.'
      );
      return;
    }

    Alert.alert(
      'Delete Autograph',
      'This cannot be undone. Are you sure you want to permanently delete this autograph?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await callEdgeFunction('delete-autograph', { autograph_id: item.id });
              closeModal();
              setData((prev) => prev.filter((i) => i.id !== item.id));
            } catch {
              Alert.alert('Error', 'Could not delete autograph. Please try again.');
            }
          },
        },
      ]
    );
  };

  const openPrintPreview = async (item: AutographItem) => {
    setLoadingPrintPreview(true);
    setPrintSessionKey(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      const preview = await callEdgeFunction<PrintPreview>('preview-autograph-print', {
        autograph_id: item.id,
      });
      setPrintItem(item);
      setPrintPreview(preview);
    } catch {
      Alert.alert('Print Autograph', 'Could not load the print preview. Please try again.');
    } finally {
      setLoadingPrintPreview(false);
    }
  };

  const closePrintPreview = () => {
    if (creatingPrint) return;
    setPrintItem(null);
    setPrintPreview(null);
    setPrintStep('preview');
    setShippingName('');
    setShippingLine1('');
    setShippingLine2('');
    setShippingCity('');
    setShippingState('');
    setShippingZip('');
  };

  const handleProceedToShipping = () => {
    if (!printPreview) return;
    setPrintStep('shipping');
  };

  const handleSubmitPrintOrder = async () => {
    if (!printItem || !printPreview) return;

    const missingFields = [
      !shippingName.trim() && 'Full name',
      !shippingLine1.trim() && 'Street address',
      !shippingCity.trim() && 'City',
      !shippingState.trim() && 'State',
      !shippingZip.trim() && 'ZIP code',
    ].filter(Boolean);

    if (missingFields.length > 0) {
      Alert.alert('Missing Information', `Please fill in: ${missingFields.join(', ')}.`);
      return;
    }

    setCreatingPrint(true);
    setPrintStep('processing');

    try {
      // Step 1: create payment intent
      const paymentData = await callEdgeFunction<{
        client_secret: string;
        payment_intent_id: string;
        payment_event_id: string;
        amount_cents: number;
      }>('create-print-payment-intent', { autograph_id: printItem.id, idempotency_key: printSessionKey });

      // Step 2: present Stripe payment sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: paymentData.client_secret,
        merchantDisplayName: 'Ophinia',
      });

      if (initError) {
        Alert.alert('Payment Error', 'Could not start payment. Please try again.');
        setPrintStep('shipping');
        setCreatingPrint(false);
        return;
      }

      const { error: paymentError } = await presentPaymentSheet();
      if (paymentError) {
        if (paymentError.code !== 'Canceled') {
          Alert.alert('Payment Failed', 'Could not complete payment. Please try again.');
        }
        setPrintStep('shipping');
        setCreatingPrint(false);
        return;
      }

      // Step 3: submit print order — edge function generates the 8×12 layout automatically
      await callEdgeFunction('submit-print-order', {
        autograph_id: printItem.id,
        payment_event_id: paymentData.payment_event_id,
        shipping_name: shippingName.trim(),
        shipping_line1: shippingLine1.trim(),
        shipping_line2: shippingLine2.trim() || null,
        shipping_city: shippingCity.trim(),
        shipping_state: shippingState.trim(),
        shipping_zip: shippingZip.trim(),
      });

      setPrintPreview((prev) => prev ? ({ ...prev, owner_print_count: (prev.owner_print_count ?? 0) + 1 }) : prev);
      Alert.alert(
        'Print Order Placed!',
        "Your official print is on its way. You'll receive a shipping confirmation from our print partner."
      );
      closePrintPreview();
    } catch (error) {
      Alert.alert(
        'Print Order Failed',
        getErrorMessage(error, 'Could not place your print order. Please try again.')
      );
      setPrintStep('shipping');
    } finally {
      setCreatingPrint(false);
    }
  };

  const openDamageClaim = (printId: string, autographId: string) => {
    setDamageClaim({
      printId,
      autographId,
      step: 'intro',
      claimId: null,
      frontPhotoUri: null,
      backPhotoUri: null,
      destructionPhotoUri: null,
      submitting: false,
    });
  };

  const pickDamagePhoto = async (side: 'front' | 'back' | 'destruction') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setDamageClaim((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          frontPhotoUri: side === 'front' ? uri : prev.frontPhotoUri,
          backPhotoUri: side === 'back' ? uri : prev.backPhotoUri,
          destructionPhotoUri: side === 'destruction' ? uri : prev.destructionPhotoUri,
        };
      });
    }
  };

  const uploadDamagePhoto = async (uri: string): Promise<string> => {
    // Upload photo to Supabase storage and return a public URL
    const fileName = `damage-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const response = await fetch(uri);
    const blob = await response.blob();

    const { data, error } = await supabase.storage
      .from('damage-claim-photos')
      .upload(`${user?.id}/${fileName}`, blob, { contentType: 'image/jpeg', upsert: false });

    if (error || !data) throw new Error('Could not upload photo.');

    const { data: urlData } = supabase.storage
      .from('damage-claim-photos')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  };

  const handleSubmitDamageEvidence = async () => {
    if (!damageClaim?.frontPhotoUri || !damageClaim?.backPhotoUri) {
      Alert.alert('Missing Photos', 'Please provide both the front and back photos of your print.');
      return;
    }

    setDamageClaim((prev) => prev ? ({ ...prev, submitting: true }) : prev);
    try {
      const [frontUrl, backUrl] = await Promise.all([
        uploadDamagePhoto(damageClaim.frontPhotoUri),
        uploadDamagePhoto(damageClaim.backPhotoUri),
      ]);

      const result = await callEdgeFunction<{ claim: { id: string; status: string } }>(
        'create-print-damage-claim',
        {
          print_id: damageClaim.printId,
          damage_front_photo_url: frontUrl,
          damage_back_photo_url: backUrl,
        }
      );

      setDamageClaim((prev) => prev ? ({
        ...prev,
        claimId: result.claim.id,
        step: 'submitted',
        submitting: false,
      }) : prev);
    } catch {
      Alert.alert('Submission Failed', 'Could not submit your damage claim. Please try again.');
      setDamageClaim((prev) => prev ? ({ ...prev, submitting: false }) : prev);
    }
  };

  const handleSubmitDestructionPhoto = async () => {
    if (!damageClaim?.destructionPhotoUri || !damageClaim?.claimId) return;

    setDamageClaim((prev) => prev ? ({ ...prev, submitting: true }) : prev);
    try {
      const destructionUrl = await uploadDamagePhoto(damageClaim.destructionPhotoUri);

      await callEdgeFunction('submit-destruction-photo', {
        claim_id: damageClaim.claimId,
        destruction_photo_url: destructionUrl,
      });

      setDamageClaim((prev) => prev ? ({ ...prev, step: 'done', submitting: false }) : prev);
    } catch {
      Alert.alert('Submission Failed', 'Could not submit your destruction photo. Please try again.');
      setDamageClaim((prev) => prev ? ({ ...prev, submitting: false }) : prev);
    }
  };

  const canCreateSeriesWithItem = (item: AutographItem) =>
    item.creatorId === user?.id && !item.seriesId;

  const startSeriesSelection = () => {
    const eligibleCount = data.filter(canCreateSeriesWithItem).length;
    if (eligibleCount === 0) {
      Alert.alert('No Eligible Videos', 'You can only create a series from videos you created and have not already assigned to a series.');
      return;
    }

    setSeriesSelectionMode(true);
    setSelectedIds(new Set());
  };

  const closeSeriesFlow = () => {
    setSeriesSelectionMode(false);
    setSeriesSheetVisible(false);
    setSelectedIds(new Set());
    setSeriesNameInput('');
  };

  const handleCreateSeries = async () => {
    const name = seriesNameInput.trim();
    if (!name) {
      Alert.alert('Required', 'Please enter a series name.');
      return;
    }
    if (name.length > 20) {
      Alert.alert('Too long', 'Series name must be 20 characters or fewer.');
      return;
    }
    if (selectedSeriesItems.length === 0) {
      Alert.alert('Select Videos', 'Choose at least one video for this series.');
      return;
    }

    setSeriesSaving(true);
    try {
      const result = await callEdgeFunction<{
        series: { id: string; name: string; max_size: number };
        assignments: { autograph_id: string; series_sequence_number: number }[];
      }>('create-series-batch', {
        name,
        autograph_ids: selectedSeriesItems.map((item) => item.id),
      });

      const sequenceMap = Object.fromEntries(
        (result.assignments ?? []).map((assignment) => [assignment.autograph_id, assignment.series_sequence_number])
      ) as Record<string, number>;

      setData((prev) =>
        prev.map((item) =>
          sequenceMap[item.id]
            ? {
                ...item,
                seriesId: result.series.id,
                seriesName: result.series.name,
                seriesSequenceNumber: sequenceMap[item.id],
                seriesMaxSize: result.series.max_size,
              }
            : item
        )
      );
      setSelectedItem((prev) =>
        prev && sequenceMap[prev.id]
          ? {
              ...prev,
              seriesId: result.series.id,
              seriesName: result.series.name,
              seriesSequenceNumber: sequenceMap[prev.id],
              seriesMaxSize: result.series.max_size,
            }
          : prev
      );
      closeSeriesFlow();
      Alert.alert(
        'Series Created',
        `"${result.series.name}" is now locked at ${result.series.max_size} videos, ordered oldest to newest.`
      );
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not create series.');
    } finally {
      setSeriesSaving(false);
    }
  };

  const openVideo = (item: AutographItem) => {
    setSelectedItem(item);
  };

  const closeModal = () => {
    setSelectedItem(null);
  };

  const shareAutograph = async (item: AutographItem) => {
    const autographUrl = buildAutographUrl(item.id);
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? {
              message: `Check out this verified autograph from ${item.creatorName ?? 'a creator'} on Ophinia.`,
              url: autographUrl,
            }
          : {
              message: `Check out this verified autograph from ${item.creatorName ?? 'a creator'} on Ophinia.\n${autographUrl}`,
            }
      );
    } catch {}
  };

  const handleModalShow = () => {};

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        try {
          await callEdgeFunction('expire-autograph-offers', {});
        } catch {}

        Promise.all([
          supabase.rpc('get_owned_listing_feed', {
            p_owner_id: user.id,
            p_limit: 200,
            p_before_created_at: null,
            p_before_id: null,
          }),
          supabase.rpc('get_offer_queue_feed', {
            p_owner_id: user.id,
            p_limit: 200,
            p_before_headline_amount: null,
            p_before_headline_created_at: null,
            p_before_autograph_id: null,
          }),
        ]).then(async ([autographsRes, offersRes]) => {
          const rows = autographsRes.data;
          const error = autographsRes.error;
          if (error) { console.log('Load autographs error:', error); setData([]); return; }
          const items: AutographItem[] = (rows as OwnedListingRow[] ?? []).map(mapOwnedListingRow);
          const templateIds = await fetchAutographTemplateIds(items.map((item) => item.id));
          const enrichedItems = items.map((item) => ({
            ...item,
            templateId: templateIds[item.id] ?? item.templateId ?? 'classic',
          }));
          const offerRows = (offersRes.data as OfferQueueRow[] ?? []);
          const offers = offerRows.map(mapOfferQueueRow);

          setData(enrichedItems);
          setIncomingOffers(offers);
        });
      })();
    }, [user])
  );

  const handleIncomingOffer = async (offerId: string, action: 'accept' | 'decline') => {
    setOfferActioningId(offerId);
    try {
      await callEdgeFunction('respond-autograph-offer', {
        offer_id: offerId,
        action,
      });
      setIncomingOffers((prev) => prev.filter((offer) => offer.id !== offerId));
      Alert.alert(
        action === 'accept' ? 'Offer Accepted' : 'Offer Declined',
        action === 'accept'
          ? 'The buyer now has 24 hours to complete the purchase.'
          : 'The offer was declined.'
      );
    } catch {
      Alert.alert('Offer Error', 'Could not update offer. Please try again.');
    } finally {
      setOfferActioningId(null);
    }
  };

  const filteredData = useMemo(() => {
    let items = data;
    if (filters.creator.trim()) {
      const q = filters.creator.trim().toLowerCase();
      items = items.filter((i) => i.creatorName?.toLowerCase().includes(q));
    }
    if (filters.series.trim()) {
      const q = filters.series.trim().toLowerCase();
      items = items.filter((i) => i.seriesName?.toLowerCase().includes(q));
    }
    if (filters.listed && !filters.unlisted) items = items.filter((i) => i.saleState !== 'not_for_sale');
    if (filters.unlisted && !filters.listed) items = items.filter((i) => i.saleState === 'not_for_sale');
    if (sort === 'newest') items = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (sort === 'oldest') items = [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return items;
  }, [data, filters, sort]);

  const selectedSeriesItems = useMemo(
    () => filteredData.filter((item) => selectedIds.has(item.id)),
    [filteredData, selectedIds]
  );

  const isFiltered = filters.creator.trim() !== '' || filters.series.trim() !== '' || filters.listed || filters.unlisted || sort !== 'newest';

  const emptyComponent = useMemo(
    () => <Text style={styles.emptyText}>No autograph captures saved yet.</Text>,
    []
  );

  const autographMap = useMemo(
    () => Object.fromEntries(data.map((item) => [item.id, item])),
    [data]
  );

  const offersByAutograph = useMemo(() => {
    const grouped = new Map<string, IncomingOfferItem[]>();

    for (const offer of incomingOffers) {
      const existing = grouped.get(offer.autographId) ?? [];
      existing.push(offer);
      grouped.set(offer.autographId, existing);
    }

    return Array.from(grouped.entries()).map(([autographId, offers]) => {
      const accepted = offers.find((offer) => offer.status === 'accepted') ?? null;
      const onHold = offers
        .filter((offer) => offer.status === 'on_hold')
        .sort((a, b) => b.amountCents - a.amountCents || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const pending = offers
        .filter((offer) => offer.status === 'pending')
        .sort((a, b) => b.amountCents - a.amountCents || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      return {
        autographId,
        autograph: autographMap[autographId] ?? null,
        accepted,
        onHold,
        pending,
      };
    });
  }, [incomingOffers, autographMap]);

  const listHeader = (
    <>
      <View style={styles.filterHeaderRow}>
        {seriesSelectionMode ? (
          <>
            <Pressable onPress={closeSeriesFlow}>
              <Text style={styles.selectionModeCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.filterResultCount}>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select autographs'}
            </Text>
            <Pressable
              style={[styles.filterButton, selectedIds.size === 0 && { opacity: 0.4 }]}
              disabled={selectedIds.size === 0}
              onPress={() => {
                setSeriesNameInput('');
                setSeriesSheetVisible(true);
              }}
            >
              <Text style={styles.filterButtonText}>Next ({selectedIds.size})</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.filterResultCount}>{filteredData.length} autograph{filteredData.length !== 1 ? 's' : ''}</Text>
            <View style={styles.headerButtons}>
              <Pressable
                style={[styles.filterButton, { borderWidth: 0 }]}
                onPress={startSeriesSelection}
              >
                <Text style={styles.filterButtonText}>Create Series</Text>
              </Pressable>
              <Pressable
                style={[styles.filterButton, isFiltered && styles.filterButtonActive]}
                onPress={() => { setDraftFilters(filters); setDraftSort(sort); setFilterVisible(true); }}
              >
                <Text style={[styles.filterButtonText, isFiltered && styles.filterButtonTextActive]}>
                  {isFiltered ? 'Filtered ✕' : 'Filter/Sort'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
      {offersByAutograph.length > 0 && !seriesSelectionMode && (
        <View style={styles.offerSection}>
          <Text style={styles.offerSectionTitle}>Offer Queue</Text>
          {offersByAutograph.map((group) => {
            const autograph = group.autograph;
            const headlineOffer = group.accepted ?? group.pending[0] ?? group.onHold[0] ?? null;
            if (!headlineOffer) return null;

            return (
              <Pressable
                key={group.autographId}
                style={styles.offerCard}
                onPress={() => {
                  if (autograph) openVideo(autograph);
                }}
              >
                <View style={styles.offerCardTop}>
                  {autograph ? (
                    <PublicVideoThumbnail
                      videoUrl={autograph.videoUri}
                      thumbnailUrl={autograph.thumbnailUrl}
                      previewFrameUrls={autograph.previewFrameUrls}
                      previewFrameTimesMs={autograph.previewFrameTimesMs}
                      strokes={autograph.strokes ?? []}
                      captureWidth={autograph.captureWidth || 1}
                      captureHeight={autograph.captureHeight || 1}
                      strokeColor={autograph.strokeColor}
                      shellStyle={styles.offerThumbnail}
                    />
                  ) : (
                    <View style={styles.offerThumbnail}>
                      <Text style={styles.thumbnailText}>Video</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <NameWithSequence name={headlineOffer.creatorName ?? ''} sequenceNumber={headlineOffer.creatorSequenceNumber} style={styles.offerCardTitle} />
                    {autograph ? (
                      <CardMetadataBlock
                        compact
                        sequenceNumber={autograph.creatorSequenceNumber}
                        capturedAt={autograph.createdAt}
                        printCount={autograph.printCount}
                        seriesName={autograph.seriesName}
                        seriesEdition={formatSeriesEdition(autograph)}
                      />
                    ) : null}
                    {group.accepted ? (
                      <Text style={styles.offerCardMeta}>
                        1 awaiting payment · due {formatDateTimeWithClock(group.accepted.paymentDueAt ?? '')}
                      </Text>
                    ) : null}
                    {group.pending.length > 0 ? (
                      <Text style={styles.offerCardMeta}>
                        {group.pending.length} active offer{group.pending.length !== 1 ? 's' : ''} · highest ${(group.pending[0].amountCents / 100).toFixed(2)}
                      </Text>
                    ) : null}
                    {!group.accepted && group.pending[0]?.expiresAt ? (
                      <Text style={styles.offerCardMeta}>
                        Offer expires {formatDateTimeWithClock(group.pending[0].expiresAt)}
                      </Text>
                    ) : null}
                    {group.onHold.length > 0 ? (
                      <Text style={styles.offerCardMeta}>
                        {group.onHold.length} backup offer{group.onHold.length !== 1 ? 's' : ''} on hold
                      </Text>
                    ) : null}
                    <Text style={styles.offerCardHint}>Tap card to preview video</Text>
                  </View>
                  <Text style={styles.offerCardAmount}>${(headlineOffer.amountCents / 100).toFixed(2)}</Text>
                </View>
                {group.accepted ? (
                  <View style={styles.offerStatusPanel}>
                    <Text style={styles.offerStatusLabel}>Awaiting Buyer Payment</Text>
                    <Text style={styles.offerStatusDetail}>
                      Backup offers are preserved and will reactivate if payment is not completed.
                    </Text>
                  </View>
                ) : group.pending[0] ? (
                  <View style={styles.offerCardActions}>
                    <Pressable
                      style={[styles.offerPrimaryButton, offerActioningId === group.pending[0].id && styles.offerButtonDisabled]}
                      onPress={() => handleIncomingOffer(group.pending[0].id, 'accept')}
                      disabled={offerActioningId === group.pending[0].id}
                    >
                      <Text style={styles.offerPrimaryButtonText}>{offerActioningId === group.pending[0].id ? '...' : 'Accept'}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.offerSecondaryButton, offerActioningId === group.pending[0].id && styles.offerButtonDisabled]}
                      onPress={() => handleIncomingOffer(group.pending[0].id, 'decline')}
                      disabled={offerActioningId === group.pending[0].id}
                    >
                      <Text style={styles.offerSecondaryButtonText}>Decline</Text>
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isSelectable = seriesSelectionMode && canCreateSeriesWithItem(item);
          const isSelected = selectedIds.has(item.id);
          return (
            <Pressable
              style={[styles.gridCard, seriesSelectionMode && !isSelectable && styles.rowDisabled]}
              onPress={() => {
                if (seriesSelectionMode) {
                  if (!isSelectable) return;
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) {
                      next.delete(item.id);
                      return next;
                    }
                    if (next.size >= 50) {
                      Alert.alert('Series Limit', 'A series can include at most 50 videos.');
                      return prev;
                    }
                    next.add(item.id);
                    return next;
                  });
                } else {
                  openVideo(item);
                }
              }}
            >
              <View style={styles.thumbnailWrap}>
                <PublicVideoThumbnail
                  videoUrl={item.videoUri}
                  thumbnailUrl={item.thumbnailUrl}
                  previewFrameUrls={item.previewFrameUrls}
                  previewFrameTimesMs={item.previewFrameTimesMs}
                  strokes={item.strokes ?? []}
                  captureWidth={item.captureWidth || 1}
                  captureHeight={item.captureHeight || 1}
                  strokeColor={item.strokeColor}
                  shellStyle={styles.thumbnail}
                />
                {item.isForSale && (
                  <Pressable
                    style={styles.listedBadge}
                    onPress={(event) => {
                      event.stopPropagation();
                      openSellSheet([item]);
                    }}
                  >
                    <Text style={styles.listedBadgeText}>Listed</Text>
                  </Pressable>
                )}
                {seriesSelectionMode && (
                  <View style={[styles.selectionCheckCircle, isSelected && styles.selectionCheckCircleSelected, !isSelectable && styles.selectionCheckCircleDisabled]}>
                    {isSelected && <Text style={styles.selectionCheckTick}>✓</Text>}
                  </View>
                )}
              </View>
              <View style={styles.gridCardInfo}>
                <NameWithSequence name={item.creatorName ?? ''} sequenceNumber={item.creatorSequenceNumber} style={styles.gridCardName} />
                <CardMetadataBlock
                  compact
                  sequenceNumber={item.creatorSequenceNumber}
                  capturedAt={item.createdAt}
                  printCount={item.printCount}
                  seriesName={item.seriesName}
                  seriesEdition={formatSeriesEdition(item)}
                />
              </View>
            </Pressable>
          );
        }}
      />

      {/* Video playback modal */}
      <Modal
        visible={!!selectedItem}
        animationType="none"
        transparent={false}
        supportedOrientations={['portrait', 'landscape']}
        onShow={handleModalShow}
        onRequestClose={() => closeModal()}
      >
        <View style={styles.videoModalContainer}>
          <View style={styles.modalTopRow}>
            <Pressable style={styles.closeButton} onPress={closeModal}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>

          {selectedItem && (
            <>
              <View style={{ flex: 1 }}>
                <AutographPlayer
                  videoUrl={selectedItem.videoUri}
                  thumbnailUrl={selectedItem.thumbnailUrl}
                  previewFrameUrls={selectedItem.previewFrameUrls}
                  previewFrameTimesMs={selectedItem.previewFrameTimesMs}
                  creatorName={selectedItem.creatorName}
                  templateId={selectedItem.templateId}
                  strokes={selectedItem.strokes ?? []}
                  strokeColor={selectedItem.strokeColor}
                  captureWidth={selectedItem.captureWidth || 1}
                  captureHeight={selectedItem.captureHeight || 1}
                  onLongPress={() => setContextMenuVisible(true)}
                />
              </View>
              <View style={styles.modalMetadataBlock}>
                <View style={styles.modalNameRow}>
                  <NameWithSequence name={selectedItem.creatorName ?? ''} sequenceNumber={selectedItem.creatorSequenceNumber} style={styles.modalNameText} />
                  {selectedItem.creatorNameVerified && (
                    <Image source={require('../assets/images/Ophinia_badge_navy background.png')} style={styles.nameBadge} resizeMode="contain" />
                  )}
                </View>
                <Text style={styles.modalMetaLine}>
                  {[
                    formatCardDate(selectedItem.createdAt),
                    selectedItem.printCount != null ? `Print #${selectedItem.printCount + 1}` : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
                {selectedItem.seriesName || formatSeriesEdition(selectedItem) ? (
                  <Text style={styles.modalMetaLine} numberOfLines={1}>
                    {[selectedItem.seriesName, formatSeriesEdition(selectedItem)].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                <View style={styles.modalUtilityRow}>
                  <Pressable style={styles.modalUtilityButton} onPress={() => { void shareAutograph(selectedItem); }}>
                    <Text style={styles.modalUtilityButtonText}>Share</Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}

          {/* Context menu — long press / right-click on video */}
          {contextMenuVisible && selectedItem && (
            <Pressable style={styles.contextOverlay} onPress={() => setContextMenuVisible(false)}>
              <View style={styles.contextMenu} onStartShouldSetResponder={() => true}>
                <Text style={styles.contextMenuTitle}>{selectedItem.creatorName ?? 'Autograph'}</Text>

                <Pressable style={styles.contextMenuItem} onPress={() => { setContextMenuVisible(false); void shareAutograph(selectedItem); }}>
                  <Text style={styles.contextMenuItemText}>Share</Text>
                </Pressable>

                {selectedItem.isForSale || selectedItem.openToTrade ? (
                  <>
                    <Pressable
                      style={styles.contextMenuItem}
                      onPress={() => {
                        const item = selectedItem;
                        setContextMenuVisible(false);
                        closeModal();
                        openSellSheet([item]);
                      }}
                    >
                      <Text style={styles.contextMenuItemText}>Edit Listing</Text>
                    </Pressable>
                    <Pressable style={styles.contextMenuItem} onPress={() => { setContextMenuVisible(false); handleRemoveFromSale(selectedItem); }}>
                      <Text style={styles.contextMenuItemText}>Remove Listing</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => {
                      const item = selectedItem;
                      setContextMenuVisible(false);
                      closeModal();
                      openSellSheet([item]);
                    }}
                  >
                    <Text style={styles.contextMenuItemText}>Sell</Text>
                  </Pressable>
                )}

                {selectedItem.creatorId !== user?.id && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={() => {
                      const creatorId = selectedItem.creatorId;
                      setContextMenuVisible(false);
                      closeModal();
                      router.push(`/profile/${creatorId}`);
                    }}
                  >
                    <Text style={styles.contextMenuItemText}>Creator Profile</Text>
                  </Pressable>
                )}

                <Pressable style={styles.contextMenuItem} onPress={() => { setContextMenuVisible(false); setCertItem(selectedItem); }}>
                  <Text style={styles.contextMenuItemText}>Certificate of Authenticity</Text>
                </Pressable>

                <Pressable
                  style={[styles.contextMenuItem, loadingPrintPreview && { opacity: 0.5 }]}
                  onPress={() => {
                    const item = selectedItem;
                    setContextMenuVisible(false);
                    closeModal();
                    void openPrintPreview(item);
                  }}
                  disabled={loadingPrintPreview}
                >
                  <Text style={styles.contextMenuItemText}>
                    {loadingPrintPreview ? 'Loading Print Preview…' : 'Print Autograph'}
                  </Text>
                </Pressable>

                <Pressable style={[styles.contextMenuItem, styles.contextMenuItemDestructive]} onPress={() => { setContextMenuVisible(false); handleDelete(selectedItem); }}>
                  <Text style={[styles.contextMenuItemText, styles.contextMenuItemTextDestructive]}>Delete</Text>
                </Pressable>
              </View>
            </Pressable>
          )}


          {/* Certificate sheet overlaid inside the video modal */}
          {certItem && (
            <CertificateSheet
              signedBy={certItem.creatorName ?? '—'}
              dateCaptured={formatDateTime(certItem.createdAt)}
              edition={certItem.seriesName && certItem.seriesSequenceNumber != null && certItem.seriesMaxSize != null
                ? `${certItem.seriesName} — #${certItem.seriesSequenceNumber} of ${certItem.seriesMaxSize}`
                : null}
              certificateId={certItem.certificateId}
              primaryActionLabel="Creator Profile"
              onPrimaryAction={() => {
                setCertItem(null);
                closeModal();
                router.push(`/profile/${certItem.creatorId}`);
              }}
              onClose={() => setCertItem(null)}
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={seriesSheetVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { if (!seriesSaving) setSeriesSheetVisible(false); }}
      >
        <Pressable
          style={styles.sellSheetOverlay}
          onPress={() => { if (!seriesSaving) setSeriesSheetVisible(false); }}
        >
          <ScrollView
            style={{ width: '100%' }}
            contentContainerStyle={styles.certSheet}
            keyboardShouldPersistTaps="handled"
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.certTitle}>Create Series</Text>
            <Text style={styles.certDate}>
              {selectedSeriesItems.length} video{selectedSeriesItems.length !== 1 ? 's' : ''} · oldest to newest
            </Text>

            <Text style={[styles.certIdLabel, { marginTop: 16, marginBottom: 6 }]}>Series Name</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="e.g. Hawaii Trip"
              maxLength={20}
              value={seriesNameInput}
              onChangeText={setSeriesNameInput}
              autoFocus
              editable={!seriesSaving}
            />
            <Text style={[styles.certDate, { fontSize: 11, color: '#999', marginBottom: 12 }]}>
              {seriesNameInput.length}/20
            </Text>
            <Text style={styles.seriesLockedCopy}>
              This will create a locked series of {selectedSeriesItems.length} videos ordered oldest to newest. The videos and order cannot be changed later.
            </Text>

            <Pressable
              style={[styles.certCloseButton, seriesSaving && { opacity: 0.6 }]}
              onPress={handleCreateSeries}
              disabled={seriesSaving}
            >
              <Text style={styles.closeButtonText}>{seriesSaving ? 'Creating…' : `Create Series (${selectedSeriesItems.length})`}</Text>
            </Pressable>

            <Pressable
              onPress={() => { if (!seriesSaving) setSeriesSheetVisible(false); }}
              style={{ marginTop: 12 }}
              disabled={seriesSaving}
            >
              <Text style={styles.certDate}>Back</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Modal>

      {/* Print modal */}
      <Modal
        visible={!!printItem && !!printPreview}
        animationType="slide"
        transparent={true}
        onRequestClose={closePrintPreview}
      >
        <Pressable style={styles.sellSheetOverlay} onPress={printStep === 'processing' ? undefined : closePrintPreview}>
          <ScrollView
            style={{ width: '100%' }}
            contentContainerStyle={styles.printSheet}
            onStartShouldSetResponder={() => true}
          >
            {printItem && printPreview ? (
              <>
                {/* Step: preview */}
                {printStep === 'preview' && (
                  <>
                    <Text style={styles.certTitle}>Print Autograph</Text>
                    <Text style={styles.certDate}>
                      {printPreview.item_cents != null && printPreview.shipping_cents != null
                        ? `Official Ophinia print — 8×10 · $${(printPreview.item_cents / 100).toFixed(2)} + $${(printPreview.shipping_cents / 100).toFixed(2)} shipping`
                        : 'Official Ophinia print — 8×10'}
                    </Text>

                    <View style={styles.printCard}>
                      <View style={styles.printArtifact8x10}>
                        <View style={styles.printLandscape}>
                          <View style={styles.printOuterBorder} />
                          <View style={styles.printInnerBorder} />

                          <View style={styles.printHeroPlaceholder} />

                          <View style={styles.printSignaturePlaceholder}>
                            <View style={styles.printSignatureStrokeOne} />
                            <View style={styles.printSignatureStrokeTwo} />
                            <View style={styles.printSignatureStrokeThree} />
                          </View>

                          <View style={styles.printBadgePlaceholder}>
                            <View style={styles.printBadgeQrPlaceholder}>
                              <View style={styles.printBadgeQrGrid} />
                            </View>
                            <View style={styles.printBadgeLogoPlaceholder} />
                          </View>

                          <View style={styles.printMetaPlaceholder}>
                            <Text style={styles.printMetaLinePrimary}>
                              {printItem.creatorName?.toUpperCase() ?? 'CREATOR NAME'}
                              {printItem.creatorSequenceNumber != null ? ` #${printItem.creatorSequenceNumber}` : ''}
                            </Text>
                            <Text style={styles.printMetaLineSecondary}>
                              {`Captured on ${formatCardDate(printItem.createdAt)}`}
                            </Text>
                            <Text style={styles.printMetaLineSecondary}>
                              {`Print #${printPreview.next_print_sequence_number}`}
                            </Text>
                            {printItem.seriesName ? (
                              <Text style={styles.printMetaLineTertiary}>{printItem.seriesName}</Text>
                            ) : null}
                          </View>

                          <View style={styles.printFrameRow}>
                            {[0, 1, 2, 3].map((frameIndex) => (
                              <View key={frameIndex} style={styles.printSmallFramePlaceholder} />
                            ))}
                          </View>
                        </View>
                      </View>
                    </View>

                    <>
                      {printPreview.owner_print_count > 0 && printPreview.latest_owner_print ? (
                        <Text style={styles.printInfoText}>
                          {`You have ordered ${printPreview.owner_print_count} official print${printPreview.owner_print_count > 1 ? 's' : ''} of this autograph. Your most recent was ${printPreview.latest_owner_print.print_label}.`}
                        </Text>
                      ) : null}
                      <Text style={styles.printInfoText}>
                        {printPreview.item_cents != null && printPreview.shipping_cents != null
                          ? `Official 8×10 numbered print — $${(printPreview.item_cents / 100).toFixed(2)} print + $${(printPreview.shipping_cents / 100).toFixed(2)} shipping.`
                          : 'Official 8×10 numbered print shipped directly to you.'}
                      </Text>
                      <Pressable
                        style={styles.certCloseButton}
                        onPress={handleProceedToShipping}
                      >
                        <Text style={styles.closeButtonText}>
                          {printPreview.item_cents != null && printPreview.shipping_cents != null
                            ? `Order Print #${printPreview.next_print_sequence_number} — $${((printPreview.item_cents + printPreview.shipping_cents) / 100).toFixed(2)}`
                            : `Order Print #${printPreview.next_print_sequence_number}`}
                        </Text>
                      </Pressable>
                      {printPreview.latest_owner_print ? (
                        <Pressable
                          style={{ marginTop: 12 }}
                          onPress={() => {
                            if (printPreview.latest_owner_print?.id) {
                              closePrintPreview();
                              openDamageClaim(printPreview.latest_owner_print.id, printItem.id);
                            }
                          }}
                        >
                          <Text style={styles.certDate}>Report Print Damage</Text>
                        </Pressable>
                      ) : null}
                    </>

                    <Pressable onPress={closePrintPreview} style={{ marginTop: 12 }}>
                      <Text style={styles.certDate}>Close</Text>
                    </Pressable>
                  </>
                )}

                {/* Step: shipping */}
                {printStep === 'shipping' && (
                  <>
                    <Text style={styles.certTitle}>Shipping Address</Text>
                    <Text style={styles.certDate}>US addresses only. Shipping cost calculated at checkout.</Text>

                    <TextInput
                      style={styles.printInput}
                      placeholder="Full name"
                      placeholderTextColor="#999"
                      value={shippingName}
                      onChangeText={setShippingName}
                      autoCapitalize="words"
                    />
                    <TextInput
                      style={styles.printInput}
                      placeholder="Street address"
                      placeholderTextColor="#999"
                      value={shippingLine1}
                      onChangeText={setShippingLine1}
                      autoCapitalize="words"
                    />
                    <TextInput
                      style={styles.printInput}
                      placeholder="Apt, suite, unit (optional)"
                      placeholderTextColor="#999"
                      value={shippingLine2}
                      onChangeText={setShippingLine2}
                      autoCapitalize="words"
                    />
                    <TextInput
                      style={styles.printInput}
                      placeholder="City"
                      placeholderTextColor="#999"
                      value={shippingCity}
                      onChangeText={setShippingCity}
                      autoCapitalize="words"
                    />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TextInput
                        style={[styles.printInput, { flex: 1 }]}
                        placeholder="State (e.g. IN)"
                        placeholderTextColor="#999"
                        value={shippingState}
                        onChangeText={(t) => setShippingState(t.toUpperCase().slice(0, 2))}
                        autoCapitalize="characters"
                        maxLength={2}
                      />
                      <TextInput
                        style={[styles.printInput, { flex: 2 }]}
                        placeholder="ZIP code"
                        placeholderTextColor="#999"
                        value={shippingZip}
                        onChangeText={setShippingZip}
                        keyboardType="number-pad"
                        maxLength={10}
                      />
                    </View>

                    <Pressable
                      style={[styles.certCloseButton, { marginTop: 8 }]}
                      onPress={handleSubmitPrintOrder}
                    >
                      <Text style={styles.closeButtonText}>Pay $16.99</Text>
                    </Pressable>

                    <Pressable onPress={() => setPrintStep('preview')} style={{ marginTop: 12 }}>
                      <Text style={styles.certDate}>Back</Text>
                    </Pressable>
                  </>
                )}

                {/* Step: processing */}
                {printStep === 'processing' && (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <Text style={styles.certTitle}>Processing…</Text>
                    <Text style={styles.printInfoText}>Please do not close this screen.</Text>
                  </View>
                )}
              </>
            ) : null}
          </ScrollView>
        </Pressable>
      </Modal>

      {/* Damage claim modal */}
      <Modal
        visible={!!damageClaim}
        animationType="slide"
        transparent={true}
        onRequestClose={() => !damageClaim?.submitting && setDamageClaim(null)}
      >
        <Pressable
          style={styles.sellSheetOverlay}
          onPress={() => !damageClaim?.submitting && setDamageClaim(null)}
        >
          <ScrollView
            style={{ width: '100%' }}
            contentContainerStyle={styles.printSheet}
            onStartShouldSetResponder={() => true}
          >
            {damageClaim?.step === 'intro' && (
              <>
                <Text style={styles.certTitle}>Report Print Damage</Text>
                <Text style={styles.printInfoText}>
                  If your print arrived damaged, you can submit a damage claim. Ophinia will review your evidence and, if approved, authorize a reprint.
                </Text>
                <Text style={[styles.printInfoText, { marginTop: 12 }]}>
                  You will need to provide:
                  {'\n'}• A photo of the front of your print (showing QR code)
                  {'\n'}• A photo of the back of your print (showing print date)
                </Text>
                <Text style={[styles.printInfoText, { marginTop: 12 }]}>
                  If approved, you will be asked to cut the damaged print in half and submit a photo before a reprint is authorized.
                </Text>

                <Pressable
                  style={[styles.certCloseButton, { marginTop: 20 }]}
                  onPress={() => setDamageClaim((prev) => prev ? ({ ...prev, step: 'photos' }) : prev)}
                >
                  <Text style={styles.closeButtonText}>Continue</Text>
                </Pressable>
                <Pressable onPress={() => setDamageClaim(null)} style={{ marginTop: 12 }}>
                  <Text style={styles.certDate}>Cancel</Text>
                </Pressable>
              </>
            )}

            {damageClaim?.step === 'photos' && (
              <>
                <Text style={styles.certTitle}>Damage Photos</Text>
                <Text style={styles.certDate}>Both photos are required to submit your claim.</Text>

                <Text style={[styles.printInfoText, { textAlign: 'left', marginBottom: 8 }]}>Front of print (QR code visible)</Text>
                <Pressable
                  style={styles.photoPickerBox}
                  onPress={() => pickDamagePhoto('front')}
                >
                  {damageClaim.frontPhotoUri ? (
                    <Image source={{ uri: damageClaim.frontPhotoUri }} style={styles.photoPickerPreview} />
                  ) : (
                    <Text style={styles.photoPickerLabel}>Tap to select photo</Text>
                  )}
                </Pressable>

                <Text style={[styles.printInfoText, { textAlign: 'left', marginBottom: 8, marginTop: 16 }]}>Back of print (date &amp; time visible)</Text>
                <Pressable
                  style={styles.photoPickerBox}
                  onPress={() => pickDamagePhoto('back')}
                >
                  {damageClaim.backPhotoUri ? (
                    <Image source={{ uri: damageClaim.backPhotoUri }} style={styles.photoPickerPreview} />
                  ) : (
                    <Text style={styles.photoPickerLabel}>Tap to select photo</Text>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.certCloseButton, { marginTop: 20 }, damageClaim.submitting && { opacity: 0.5 }]}
                  onPress={handleSubmitDamageEvidence}
                  disabled={damageClaim.submitting}
                >
                  <Text style={styles.closeButtonText}>
                    {damageClaim.submitting ? 'Submitting…' : 'Submit Damage Claim'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setDamageClaim((prev) => prev ? ({ ...prev, step: 'intro' }) : prev)}
                  style={{ marginTop: 12 }}
                >
                  <Text style={styles.certDate}>Back</Text>
                </Pressable>
              </>
            )}

            {damageClaim?.step === 'submitted' && (
              <>
                <Text style={styles.certTitle}>Claim Submitted</Text>
                <Text style={styles.printInfoText}>
                  Your damage claim has been received. Ophinia will review your photos and contact you through the app within a few business days.
                </Text>
                <Text style={[styles.printInfoText, { marginTop: 12 }]}>
                  If your claim is approved, you will be asked to cut the damaged print in half and submit a photo to confirm destruction before a reprint is authorized.
                </Text>
                <Pressable
                  style={[styles.certCloseButton, { marginTop: 20 }]}
                  onPress={() => setDamageClaim(null)}
                >
                  <Text style={styles.closeButtonText}>Done</Text>
                </Pressable>
              </>
            )}

            {damageClaim?.step === 'destruction' && (
              <>
                <Text style={styles.certTitle}>Confirm Destruction</Text>
                <Text style={styles.printInfoText}>
                  Your damage claim has been approved. To protect print authenticity and ensure only one physical print exists per autograph, please cut your damaged print in half and submit a photo of the front showing the QR code.
                </Text>

                <Text style={[styles.printInfoText, { textAlign: 'left', marginBottom: 8, marginTop: 16 }]}>Photo of print cut in half (QR code visible)</Text>
                <Pressable
                  style={styles.photoPickerBox}
                  onPress={() => pickDamagePhoto('destruction')}
                >
                  {damageClaim.destructionPhotoUri ? (
                    <Image source={{ uri: damageClaim.destructionPhotoUri }} style={styles.photoPickerPreview} />
                  ) : (
                    <Text style={styles.photoPickerLabel}>Tap to select photo</Text>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.certCloseButton, { marginTop: 20 }, damageClaim.submitting && { opacity: 0.5 }]}
                  onPress={handleSubmitDestructionPhoto}
                  disabled={damageClaim.submitting}
                >
                  <Text style={styles.closeButtonText}>
                    {damageClaim.submitting ? 'Submitting…' : 'Submit Destruction Photo'}
                  </Text>
                </Pressable>
              </>
            )}

            {damageClaim?.step === 'done' && (
              <>
                <Text style={styles.certTitle}>Reprint Authorized</Text>
                <Text style={styles.printInfoText}>
                  Your destruction photo has been received. Ophinia will confirm and authorize your reprint shortly. You&apos;ll receive a notification when it&apos;s ready to order.
                </Text>
                <Pressable
                  style={[styles.certCloseButton, { marginTop: 20 }]}
                  onPress={() => setDamageClaim(null)}
                >
                  <Text style={styles.closeButtonText}>Done</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Modal>

      <Modal
        visible={filterVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterVisible(false)}
      >
        <View style={styles.filterOverlay}>
          <ScrollView style={{ width: '100%' }} contentContainerStyle={styles.filterSheet} keyboardShouldPersistTaps="handled">
            <Text style={styles.filterTitle}>Filter</Text>

            <Text style={styles.filterSectionLabel}>Status</Text>
            <View style={styles.filterCheckGroup}>
              {[
                { key: 'listed', label: 'For Sale' },
                { key: 'unlisted', label: 'Not for Sale' },
              ].map(({ key, label }) => (
                <Pressable
                  key={key}
                  style={styles.filterCheckRow}
                  onPress={() => setDraftFilters((prev) => ({ ...prev, [key]: !prev[key as keyof AutograpshFilters] }))}
                >
                  <View style={[styles.filterCheckbox, draftFilters[key as keyof AutograpshFilters] && styles.filterCheckboxChecked]}>
                    {draftFilters[key as keyof AutograpshFilters] && <Text style={styles.filterCheckTick}>✓</Text>}
                  </View>
                  <Text style={styles.filterCheckLabel}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.filterSectionLabel}>Celebrity / Autographer</Text>
            <TextInput
              style={styles.filterInput}
              placeholder="e.g. Taylor Swift"
              placeholderTextColor="#aaa"
              value={draftFilters.creator}
              onChangeText={(v) => setDraftFilters((prev) => ({ ...prev, creator: v }))}
              autoCorrect={false}
            />

            <Text style={styles.filterSectionLabel}>Series</Text>
            <TextInput
              style={styles.filterInput}
              placeholder="e.g. Hawaii Trip"
              placeholderTextColor="#aaa"
              value={draftFilters.series}
              onChangeText={(v) => setDraftFilters((prev) => ({ ...prev, series: v }))}
              autoCorrect={false}
            />

            <Text style={styles.filterSectionLabel}>Sort By</Text>
            <View style={styles.filterCheckGroup}>
              {([
                { key: 'newest', label: 'Newest first' },
                { key: 'oldest', label: 'Oldest first' },
              ] as { key: AutographSort; label: string }[]).map(({ key, label }) => (
                <Pressable key={key} style={styles.filterCheckRow} onPress={() => setDraftSort(key)}>
                  <View style={[styles.filterCheckbox, draftSort === key && styles.filterCheckboxChecked]}>
                    {draftSort === key && <Text style={styles.filterCheckTick}>✓</Text>}
                  </View>
                  <Text style={styles.filterCheckLabel}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.filterApplyButton}
              onPress={() => { setFilters(draftFilters); setSort(draftSort); setFilterVisible(false); }}
            >
              <Text style={styles.filterApplyText}>Apply</Text>
            </Pressable>
            <Pressable
              style={styles.filterClearButton}
              onPress={() => { setFilters(defaultAutographFilters); setDraftFilters(defaultAutographFilters); setSort('newest'); setDraftSort('newest'); setFilterVisible(false); }}
            >
              <Text style={styles.filterClearText}>Clear All</Text>
            </Pressable>
            <Pressable style={{ marginTop: 8, marginBottom: 16 }} onPress={() => setFilterVisible(false)}>
              <Text style={[styles.certDate, { textAlign: 'center' }]}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Sale-state sheet — top-level Modal, launched from the header action */}
      <Modal
        visible={sellItems.length > 0}
        animationType="slide"
        transparent={true}
        onRequestClose={closeSellSheet}
      >
        <Pressable style={styles.sellSheetOverlay} onPress={closeSellSheet}>
          <ScrollView
            style={{ width: '100%' }}
            contentContainerStyle={styles.certSheet}
            keyboardShouldPersistTaps="handled"
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.certTitle}>
              {sellItems.length === 1 && sellItems[0].isForSale ? 'Edit Listing' : 'List for Sale'}
            </Text>
            <Text style={styles.certDate}>
              {sellItems.length === 1
                ? (sellItems[0].creatorName ?? formatDateTime(sellItems[0].createdAt))
                : `${sellItems.length} autographs`}
            </Text>

            <View style={styles.listingModeRow}>
              <Pressable
                style={[styles.listingModeOption, listingMode === 'buy_now' && styles.listingModeOptionActive]}
                onPress={() => setListingMode('buy_now')}
              >
                <Text style={[styles.listingModeOptionText, listingMode === 'buy_now' && styles.listingModeOptionTextActive]}>
                  Fixed Price
                </Text>
              </Pressable>
              <Pressable
                style={[styles.listingModeOption, listingMode === 'make_offer' && styles.listingModeOptionActive]}
                onPress={() => setListingMode('make_offer')}
              >
                <Text style={[styles.listingModeOptionText, listingMode === 'make_offer' && styles.listingModeOptionTextActive]}>
                  Estimated Value
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.certDate, { marginTop: 16, marginBottom: 4, fontWeight: '600', color: '#444' }]}>
              {listingMode === 'buy_now' ? 'Fixed Price (min $5.00)' : 'Estimated Value (min $5.00)'}
            </Text>
            <TextInput
              style={styles.priceInput}
              placeholder="e.g. 25.00"
              placeholderTextColor="#999"
              keyboardType="decimal-pad"
              returnKeyType="done"
              value={priceInput}
              onChangeText={handlePriceChange}
            />

            {listingMode === 'make_offer' && (
              <>
                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => setAutoDeclineBelow((v) => !v)}
                >
                  <View style={[styles.checkbox, autoDeclineBelow && styles.checkboxChecked]}>
                    {autoDeclineBelow && <Text style={styles.checkboxTick}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>Auto-decline offers below estimated value</Text>
                </Pressable>

                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => setAutoAcceptAbove((v) => !v)}
                >
                  <View style={[styles.checkbox, autoAcceptAbove && styles.checkboxChecked]}>
                    {autoAcceptAbove && <Text style={styles.checkboxTick}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>Auto-accept first offer at or above estimated value</Text>
                </Pressable>
              </>
            )}

            <Pressable
              style={[styles.certCloseButton, saving && { opacity: 0.6 }]}
              onPress={handleListForSale}
              disabled={saving}
            >
              <Text style={styles.closeButtonText}>
                {saving
                  ? 'Saving…'
                  : sellItems.length === 1 && sellItems[0].isForSale
                    ? 'Update Listing'
                    : `List ${sellItems.length > 1 ? `${sellItems.length} autographs` : '1 autograph'}`}
              </Text>
            </Pressable>

            <Pressable onPress={closeSellSheet} style={{ marginTop: 12 }}>
              <Text style={styles.certDate}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: BrandColors.background,
  },
  listContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  gridRow: {
    paddingHorizontal: 12,
    gap: 12,
    marginBottom: 12,
  },
  gridCard: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  thumbnailWrap: {
    position: 'relative',
  },
  listedBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#1D6EF2',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  listedBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  gridCardInfo: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  gridCardName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  gridCardSeries: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
    fontFamily: BrandFonts.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 60 / 100,
    borderRadius: 0,
    backgroundColor: '#d9d9d9',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  thumbnailText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  textContainer: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  cardSubDate: {
    fontSize: 13,
    color: '#666',
    marginTop: 3,
    fontFamily: BrandFonts.primary,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  seriesMetaText: {
    fontSize: 13,
    marginTop: 2,
    fontFamily: BrandFonts.primary,
  },
  seriesNameText: {
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  seriesEditionText: {
    color: '#888',
    fontFamily: BrandFonts.primary,
  },
  publicBadge: {
    fontSize: 12,
    color: '#1565C0',
    backgroundColor: '#E8F1FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
    overflow: 'hidden',
    fontFamily: BrandFonts.primary,
  },
  privateBadge: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#ECECEC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
    overflow: 'hidden',
    fontFamily: BrandFonts.primary,
  },
  pendingBuyerPaymentBadge: {
    fontSize: 12,
    color: '#8A5A00',
    backgroundColor: '#F7E5BF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
    overflow: 'hidden',
    fontFamily: BrandFonts.primary,
  },
  separator: {
    height: 1,
    backgroundColor: '#ccc',
  },
  offerSection: {
    marginBottom: 18,
    gap: 10,
  },
  offerSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: BrandFonts.primary,
  },
  offerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e7dfd0',
    padding: 14,
  },
  offerCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  offerThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#d9d9d9',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  offerCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  offerCardMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontFamily: BrandFonts.primary,
  },
  offerCardHint: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
    fontFamily: BrandFonts.primary,
  },
  offerCardAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  offerCardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  offerStatusPanel: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#F4F7FB',
    borderWidth: 1,
    borderColor: '#D8E2F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  offerStatusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1B3558',
    fontFamily: BrandFonts.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  offerStatusDetail: {
    fontSize: 12,
    color: '#55657C',
    marginTop: 4,
    lineHeight: 17,
    fontFamily: BrandFonts.primary,
  },
  offerPrimaryButton: {
    flex: 1,
    backgroundColor: BrandColors.primary,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  offerPrimaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  offerSecondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  offerSecondaryButtonText: {
    color: '#111',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  offerButtonDisabled: {
    opacity: 0.6,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
  },
  videoModalContainer: {
    flex: 1,
    backgroundColor: 'black',
    paddingTop: 50,
  },
  modalTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#111',
    borderRadius: 8,
  },
  deleteButton: {
    position: 'absolute',
    bottom: 48,
    left: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  deleteButtonText: {
    color: '#E53935',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
    fontSize: 16,
  },
  certButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#111',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  sellButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#111',
    borderRadius: 8,
  },
  modalTopRight: {
    flexDirection: 'row',
    gap: 8,
  },
  closeButtonText: {
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
    fontSize: 16,
  },
  videoWrapper: {
    flex: 1,
    width: '100%',
    backgroundColor: 'black',
  },
  videoLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'black',
  },
  controlButton: {
    backgroundColor: '#111',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  controlButtonText: {
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
  },
  modalDateText: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    fontSize: 14,
    color: '#fff',
    fontFamily: BrandFonts.primary,
    backgroundColor: 'black',
    textAlign: 'center',
  },
  modalMetadataBlock: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: 'black',
    alignItems: 'center',
  },
  modalNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  nameBadge: {
    width: 20,
    height: 20,
  },
  modalNameText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalMetaLine: {
    fontSize: 12,
    lineHeight: 17,
    color: '#aaa',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalUtilityRow: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  modalUtilityButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  modalUtilityButtonText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
  },
  certOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    paddingTop: 80,
  },
  contextOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenu: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    width: 260,
    overflow: 'hidden',
  },
  contextMenuTitle: {
    color: '#888',
    fontSize: 13,
    fontFamily: BrandFonts.primary,
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  contextMenuItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  contextMenuItemText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: BrandFonts.primary,
    textAlign: 'center',
  },
  contextMenuItemDestructive: {},
  contextMenuItemTextDestructive: {
    color: '#FF3B30',
  },
  sellOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    paddingTop: 50,
  },
  certSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  printSheet: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 32,
    paddingBottom: 28,
    backgroundColor: BrandColors.background,
  },
  printCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fffdf8',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e9deca',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  printArtifact8x10: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#050505',
    padding: 14,
  },
  printLandscape: {
    flex: 1,
    backgroundColor: '#050505',
  },
  printOuterBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 8,
  },
  printInnerBorder: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    bottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 4,
  },
  printHeroPlaceholder: {
    position: 'absolute',
    left: '8.8%',
    top: '8.8%',
    width: '37%',
    height: '65.5%',
    backgroundColor: '#f2ede3',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  printSignaturePlaceholder: {
    position: 'absolute',
    left: '59.5%',
    top: '8.9%',
    width: '27.1%',
    height: '26.8%',
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: 'rgba(241,193,104,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  printSignatureStrokeOne: {
    position: 'absolute',
    width: '72%',
    height: 3,
    backgroundColor: '#F1C168',
    borderRadius: 999,
    transform: [{ rotate: '-18deg' }, { translateY: -16 }],
  },
  printSignatureStrokeTwo: {
    position: 'absolute',
    width: '58%',
    height: 3,
    backgroundColor: '#F1C168',
    borderRadius: 999,
    transform: [{ rotate: '14deg' }],
  },
  printSignatureStrokeThree: {
    position: 'absolute',
    width: '66%',
    height: 3,
    backgroundColor: '#F1C168',
    borderRadius: 999,
    transform: [{ rotate: '-8deg' }, { translateY: 18 }],
  },
  printBadgePlaceholder: {
    position: 'absolute',
    right: '12.2%',
    top: '39.2%',
    width: '8.9%',
    height: '13.1%',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  printBadgeQrPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  printBadgeQrGrid: {
    width: '70%',
    height: '70%',
    borderWidth: 2,
    borderColor: '#111',
    borderStyle: 'dashed',
  },
  printBadgeLogoPlaceholder: {
    width: '100%',
    height: '18%',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 999,
  },
  printMetaPlaceholder: {
    position: 'absolute',
    left: '49.5%',
    top: '38.8%',
    width: '28.1%',
    minHeight: '16%',
    justifyContent: 'flex-start',
  },
  printMetaLinePrimary: {
    fontSize: 11,
    lineHeight: 14,
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  printMetaLineSecondary: {
    marginTop: 4,
    fontSize: 9,
    lineHeight: 12,
    color: 'rgba(255,255,255,0.72)',
    fontFamily: BrandFonts.primary,
  },
  printMetaLineTertiary: {
    marginTop: 4,
    fontSize: 8,
    lineHeight: 11,
    color: 'rgba(255,255,255,0.56)',
    fontFamily: BrandFonts.primary,
  },
  printFrameRow: {
    position: 'absolute',
    left: '52.9%',
    right: '7.7%',
    bottom: '9.4%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  printSmallFramePlaceholder: {
    width: '21%',
    aspectRatio: 3 / 5,
    backgroundColor: '#f2ede3',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  printInfoText: {
    maxWidth: 380,
    marginTop: 14,
    fontSize: 13,
    lineHeight: 18,
    color: '#555',
    textAlign: 'center',
    fontFamily: BrandFonts.primary,
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
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 16,
  },
  certHint: {
    fontSize: 13,
    color: '#999',
    marginBottom: 20,
    textAlign: 'center',
  },
  certRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    width: '100%',
  },
  certRowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    fontFamily: BrandFonts.primary,
    maxWidth: '60%',
    textAlign: 'right',
  },
  certIdLabel: {
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  certIdValue: {
    fontSize: 11,
    color: '#333',
    fontFamily: 'monospace',
    marginBottom: 24,
    textAlign: 'center',
  },
  certCloseButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#111',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#111',
  },
  checkboxTick: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  listingModeRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  listingModeOption: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#d7d1c7',
    backgroundColor: '#fff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  listingModeOptionActive: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  listingModeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    fontFamily: BrandFonts.primary,
  },
  listingModeOptionTextActive: {
    color: '#fff',
  },
  priceInput: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    marginBottom: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  selectionModeCancel: {
    fontSize: 15,
    fontWeight: '600',
    color: BrandColors.primary,
    fontFamily: BrandFonts.primary,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  selectionCheckCircle: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    marginRight: 10,
  },
  selectionCheckCircleSelected: {
    borderColor: BrandColors.primary,
    backgroundColor: BrandColors.primary,
  },
  selectionCheckCircleDisabled: {
    borderColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  selectionCheckTick: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  rowDisabled: {
    opacity: 0.5,
  },
  sellSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    paddingTop: 50,
  },
  filterResultCount: {
    fontSize: 13,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#666',
  },
  filterButtonActive: {
    backgroundColor: '#666',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  seriesLockedCopy: {
    width: '100%',
    fontSize: 13,
    lineHeight: 18,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
    fontFamily: BrandFonts.primary,
  },
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
    marginBottom: 20,
  },
  filterSectionLabel: {
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  filterCheckGroup: {
    gap: 4,
  },
  filterCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  filterCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#111',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterCheckboxChecked: {
    backgroundColor: '#111',
  },
  filterCheckTick: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  filterCheckLabel: {
    fontSize: 15,
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  filterInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
    borderWidth: 1,
    borderColor: '#ddd',
    fontFamily: BrandFonts.primary,
  },
  filterRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterRangeSep: {
    fontSize: 16,
    color: '#999',
  },
  filterApplyButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  filterApplyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  filterClearButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#111',
  },
  filterClearText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  printInput: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
    fontFamily: BrandFonts.primary,
  },
  photoPickerBox: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    backgroundColor: '#f9f6f0',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  photoPickerPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoPickerLabel: {
    fontSize: 15,
    color: '#999',
    fontFamily: BrandFonts.primary,
  },
});

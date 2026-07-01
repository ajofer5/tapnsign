import { AutographPlayer } from '@/components/autograph-player';
import { AutographPrintModal } from '@/components/autograph-print-modal';
import { CertificateSheet } from '@/components/certificate-sheet';
import { ProfileAvatar } from '@/components/profile-avatar';
import { PublicVideoThumbnail } from '@/components/public-video-thumbnail';
import { BrandColors, BrandFonts } from '@/constants/theme';
import { callEdgeFunction } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { DIGITAL_TRADING_ENABLED } from '@/lib/digital-trading';
import { buildAutographUrl } from '@/lib/public-links';
import { supabase } from '@/lib/supabase';
import { openAuthenticatedWebPath } from '@/lib/web-handoff';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStripe } from '@stripe/stripe-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
type Point = {
  x: number;
  y: number;
  t: number;
};

type Stroke = {
  id: string;
  points: Point[];
};

type AutographSort = 'newest' | 'oldest';
type CollectionSegment = 'created' | 'saved_cards' | 'saved_creators';
const COLLECTION_SEGMENT_STORAGE_PREFIX = 'ophinia.collection.activeSegment';

function isCollectionSegment(value: string | null): value is CollectionSegment {
  return value === 'created' || value === 'saved_cards' || value === 'saved_creators';
}

type AutographItem = {
  id: string;
  savedAt?: string | null;
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
  creatorVerified: boolean;
  creatorNameVerified: boolean;
  creatorPersonalizedRequestsEnabled: boolean;
  creatorSequenceNumber: number | null;
  seriesName: string | null;
  seriesSequenceNumber: number | null;
  seriesMaxSize: number | null;
  seriesId: string | null;
  printCount: number | null;
  printsEnabled: boolean;
  printLimit: number | null;
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
  print_layout_url?: string | null;
  print_preview_url?: string | null;
  print_layout_version?: string | null;
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
  creator_verified: boolean | null;
  creator_name_verified: boolean | null;
  creator_personalized_requests_enabled: boolean | null;
  creator_sequence_number: number | null;
  series_name: string | null;
  series_sequence_number: number | null;
  series_max_size: number | null;
  visibility: 'private' | 'public' | null;
  sale_state: 'not_for_sale' | 'fixed' | null;
  listing_mode: 'buy_now' | 'make_offer' | null;
  is_for_sale: boolean | null;
  price_cents: number | null;
  auto_decline_below: boolean | null;
  auto_accept_above: boolean | null;
  offer_locked_until: string | null;
  print_count: number | null;
  prints_enabled: boolean | null;
  print_limit: number | null;
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

type SavedCreatorItem = {
  savedAt: string;
  creatorId: string;
  displayName: string;
  avatarUrl: string | null;
  avatarAutograph: {
    id: string;
    thumbnail_url: string | null;
    video_url: string | null;
    strokes_json: Stroke[];
    capture_width: number;
    capture_height: number;
    stroke_color: string | null;
  } | null;
  verified: boolean;
  nameVerified: boolean;
  bio: string | null;
  personalizedRequestsEnabled: boolean;
  printCount: number;
};

type SavedCreatorRow = {
  saved_at: string;
  creator_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_autograph: {
    id: string;
    thumbnail_url: string | null;
    video_url: string | null;
    strokes_json: Stroke[] | null;
    capture_width: number | null;
    capture_height: number | null;
    stroke_color: string | null;
  } | null;
  verified: boolean | null;
  name_verified: boolean | null;
  bio: string | null;
  personalized_requests_enabled: boolean | null;
  print_count: number | string | null;
};

type CollectionListRow =
  | { kind: 'autograph'; source: 'created' | 'saved_cards'; item: AutographItem }
  | { kind: 'creator'; item: SavedCreatorItem };

const COLLECTION_PAGE_SIZE = 24;

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
    savedAt: null,
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
    visibility: row.visibility === 'public' ? 'public' : 'private',
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
    creatorVerified: !!row.creator_verified,
    creatorNameVerified: !!row.creator_name_verified,
    creatorPersonalizedRequestsEnabled: !!row.creator_personalized_requests_enabled,
    creatorSequenceNumber: row.creator_sequence_number ?? null,
    seriesName: row.series_name ?? null,
    seriesSequenceNumber: row.series_sequence_number ?? null,
    seriesMaxSize: row.series_max_size ?? null,
    seriesId: null,
    printCount: row.print_count ?? null,
    printsEnabled: !!row.prints_enabled,
    printLimit: row.print_limit ?? null,
  };
}

function mapSavedListingRow(row: OwnedListingRow & { saved_at?: string | null }): AutographItem {
  return {
    ...mapOwnedListingRow(row),
    savedAt: row.saved_at ?? null,
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

function mapSavedCreatorRow(row: SavedCreatorRow): SavedCreatorItem {
  return {
    savedAt: row.saved_at,
    creatorId: row.creator_id,
    displayName: row.display_name ?? 'Creator',
    avatarUrl: row.avatar_url ?? null,
    avatarAutograph: row.avatar_autograph
      ? {
          id: row.avatar_autograph.id,
          thumbnail_url: row.avatar_autograph.thumbnail_url ?? null,
          video_url: row.avatar_autograph.video_url ?? null,
          strokes_json: row.avatar_autograph.strokes_json ?? [],
          capture_width: row.avatar_autograph.capture_width ?? 1,
          capture_height: row.avatar_autograph.capture_height ?? 1,
          stroke_color: row.avatar_autograph.stroke_color ?? null,
        }
      : null,
    verified: !!row.verified,
    nameVerified: !!row.name_verified,
    bio: row.bio ?? null,
    personalizedRequestsEnabled: !!row.personalized_requests_enabled,
    printCount: Number(row.print_count ?? 0),
  };
}

export default function AutographsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<AutographItem[]>([]);
  const [savedCards, setSavedCards] = useState<AutographItem[]>([]);
  const [savedCreators, setSavedCreators] = useState<SavedCreatorItem[]>([]);
  const [activeSegment, setActiveSegment] = useState<CollectionSegment>('created');
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
  const [sort, setSort] = useState<AutographSort>('newest');
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
  const [printQuantity, setPrintQuantity] = useState(1);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [loadingMoreCollection, setLoadingMoreCollection] = useState(false);
  const [hasMoreCollection, setHasMoreCollection] = useState(true);

  // Print order flow
  const [printStep, setPrintStep] = useState<'preview' | 'processing'>('preview');
  const [addressSheetVisible, setAddressSheetVisible] = useState(false);

  // Damage claim flow
  const [damageClaim, setDamageClaim] = useState<{
    printId: string;
    autographId: string;
    step: 'form' | 'submitted';
    claimType: 'damaged' | 'lost';
    reasonCode: 'damaged_in_shipping' | 'print_defect' | 'wrong_item' | 'other' | null;
    frontPhotoUri: string | null;
    backPhotoUri: string | null;
    destructionPhotoUri: string | null;
    submitting: boolean;
  } | null>(null);

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { user, profile } = useAuth();
  const collectionSegmentStorageKey = user?.id
    ? `${COLLECTION_SEGMENT_STORAGE_PREFIX}.${user.id}`
    : null;

  useEffect(() => {
    if (!collectionSegmentStorageKey) return;

    let cancelled = false;
    AsyncStorage.getItem(collectionSegmentStorageKey)
      .then((storedSegment) => {
        if (!cancelled && isCollectionSegment(storedSegment)) {
          setActiveSegment(storedSegment);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [collectionSegmentStorageKey]);

  const handleCollectionSegmentChange = useCallback((segment: CollectionSegment) => {
    setActiveSegment(segment);
    setHasMoreCollection(true);
    if (collectionSegmentStorageKey) {
      AsyncStorage.setItem(collectionSegmentStorageKey, segment).catch(() => {});
    }
  }, [collectionSegmentStorageKey]);

  const closeSellSheet = () => {
    setSellItems([]);
    setListingMode('buy_now');
    setPriceInput('');
    setAutoDeclineBelow(false);
    setAutoAcceptAbove(false);
  };

  const openSellSheet = (_items: AutographItem[]) => {
    if (!DIGITAL_TRADING_ENABLED) return;
    void openAuthenticatedWebPath('/app/me/listings').catch(() => {
      Alert.alert('Print Settings', 'Could not open print settings. Please try again.');
    });
  };

  const handleListForSale = async () => {
    closeSellSheet();
  };

  const handleRemoveFromSale = (item: AutographItem) => {
    void item;
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
            } catch (error) {
              Alert.alert(
                'Could Not Delete',
                error instanceof Error ? error.message : 'Could not delete autograph. Please try again.'
              );
            }
          },
        },
      ]
    );
  };

  const handleTogglePrintsEnabled = async (item: AutographItem) => {
    const next = !item.printsEnabled;
    const payoutConnected =
      profile?.stripe_connect_onboarding_complete === true &&
      profile?.stripe_connect_charges_enabled === true &&
      profile?.stripe_connect_payouts_enabled === true;
    if (next && !payoutConnected) {
      Alert.alert(
        'Payout Setup Required',
        'Complete payout setup before enabling public prints.'
      );
      return;
    }
    const label = next ? 'Enable Prints' : 'Disable Prints';
    const confirm = next
      ? 'Allow anyone to order an official 8×10 print of this autograph?'
      : 'Stop allowing new print orders for this autograph?';
    Alert.alert(label, confirm, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: label,
        onPress: async () => {
          try {
            await callEdgeFunction('set-prints-enabled', {
              autograph_id: item.id,
              prints_enabled: next,
            });
            const patch = {
              printsEnabled: next,
              visibility: (next ? 'public' : 'private') as 'public' | 'private',
            };
            setData((prev) =>
              prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i))
            );
            setSelectedItem((prev) =>
              prev?.id === item.id ? { ...prev, ...patch } : prev
            );
          } catch (error) {
            Alert.alert('Error', error instanceof Error ? error.message : 'Could not update print settings. Please try again.');
          }
        },
      },
    ]);
  };

  const openPrintPreview = async (item: AutographItem) => {
    setSelectedItem(null);
    setContextMenuVisible(false);
    setPrintItem(item);
    setPrintPreview(null);
    setLoadingPrintPreview(true);
    setPrintSessionKey(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      const preview = await callEdgeFunction<PrintPreview>('preview-autograph-print', {
        autograph_id: item.id,
      });
      setPrintPreview(preview);
    } catch (error) {
      setPrintItem(null);
      Alert.alert(
        'Print Autograph',
        error instanceof Error ? error.message : 'Could not load the print preview. Please try again.'
      );
    } finally {
      setLoadingPrintPreview(false);
    }
  };

  const closePrintPreview = () => {
    if (creatingPrint) return;
    setPrintItem(null);
    setPrintPreview(null);
    setPrintStep('preview');
    setAddressSheetVisible(false);
    setPrintQuantity(1);
  };

  const handleProceedToPayment = () => {
    if (!printPreview) return;
    setAddressSheetVisible(true);
  };

  const handleAddressSubmit = async (addressDetails: import('@stripe/stripe-react-native').AddressDetails) => {
    setAddressSheetVisible(false);
    if (!printItem || !printPreview) return;

    const a = addressDetails.address;
    const addr = {
      name: addressDetails.name ?? '',
      line1: a?.line1 ?? '',
      line2: a?.line2 ?? '',
      city: a?.city ?? '',
      state: a?.state ?? '',
      zip: a?.postalCode ?? '',
    };
    setCreatingPrint(true);
    setPrintStep('processing');

    try {
      // Step 1: create payment intent
      const paymentData = await callEdgeFunction<{
        client_secret: string;
        payment_intent_id: string;
        payment_event_id: string;
        amount_cents: number;
      }>('create-print-payment-intent', { autograph_id: printItem.id, idempotency_key: `${printSessionKey}-qty${printQuantity}`, quantity: printQuantity });

      // Step 2: present Stripe payment sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: paymentData.client_secret,
        merchantDisplayName: 'Ophinia',
      });

      if (initError) {
        Alert.alert('Payment Error', 'Could not start payment. Please try again.');
        setPrintStep('preview');
        setCreatingPrint(false);
        return;
      }

      const { error: paymentError } = await presentPaymentSheet();
      if (paymentError) {
        if (paymentError.code !== 'Canceled') {
          Alert.alert('Payment Failed', 'Could not complete payment. Please try again.');
        }
        setPrintStep('preview');
        setCreatingPrint(false);
        return;
      }

      // Step 3: submit print order
      await callEdgeFunction('submit-print-order', {
        autograph_id: printItem.id,
        payment_event_id: paymentData.payment_event_id,
        image_url: printPreview.print_layout_url ?? null,
        quantity: printQuantity,
        shipping_name: addr.name,
        shipping_line1: addr.line1,
        shipping_line2: addr.line2 || null,
        shipping_city: addr.city,
        shipping_state: addr.state,
        shipping_zip: addr.zip,
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
      setPrintStep('preview');
    } finally {
      setCreatingPrint(false);
    }
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

  const handleSubmitClaim = async () => {
    if (!damageClaim) return;

    if (damageClaim.claimType === 'damaged') {
      if (!damageClaim.frontPhotoUri || !damageClaim.backPhotoUri || !damageClaim.destructionPhotoUri) {
        Alert.alert('Missing Photos', 'All three photos are required to submit a damage claim.');
        return;
      }
      if (!damageClaim.reasonCode) {
        Alert.alert('Missing Reason', 'Please select a reason for your claim.');
        return;
      }
    }

    setDamageClaim((prev) => prev ? ({ ...prev, submitting: true }) : prev);
    try {
      let frontUrl: string | null = null;
      let backUrl: string | null = null;
      let destructionUrl: string | null = null;

      if (damageClaim.claimType === 'damaged') {
        [frontUrl, backUrl, destructionUrl] = await Promise.all([
          uploadDamagePhoto(damageClaim.frontPhotoUri!),
          uploadDamagePhoto(damageClaim.backPhotoUri!),
          uploadDamagePhoto(damageClaim.destructionPhotoUri!),
        ]);
      }

      await callEdgeFunction('create-print-damage-claim', {
        print_id: damageClaim.printId,
        claim_type: damageClaim.claimType,
        reason_code: damageClaim.claimType === 'lost' ? 'never_arrived' : damageClaim.reasonCode,
        ...(damageClaim.claimType === 'damaged' && {
          damage_front_photo_url: frontUrl,
          damage_back_photo_url: backUrl,
          destruction_photo_url: destructionUrl,
        }),
      });

      setDamageClaim((prev) => prev ? ({ ...prev, step: 'submitted', submitting: false }) : prev);
    } catch (e) {
      Alert.alert('Submission Failed', e instanceof Error ? e.message : 'Could not submit your claim. Please try again.');
      setDamageClaim((prev) => prev ? ({ ...prev, submitting: false }) : prev);
    }
  };

  const canCreateSeriesWithItem = (item: AutographItem) =>
    item.creatorId === user?.id && !item.seriesId;

  const startSeriesSelection = () => {
    const eligibleCount = data.filter(canCreateSeriesWithItem).length;
    if (eligibleCount === 0) {
      Alert.alert('No Eligible Moments', 'You can only create a series from moments you captured and have not already assigned to a series.');
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
      Alert.alert('Select Moments', 'Choose at least one moment for this series.');
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
        `"${result.series.name}" is now locked at ${result.series.max_size} moments, ordered oldest to newest.`
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

  const handleUnsaveCard = async (item: AutographItem) => {
    if (!user) return;
    const previous = savedCards;
    setSavedCards((current) => current.filter((saved) => saved.id !== item.id));

    const { error } = await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', user.id)
      .eq('autograph_id', item.id);

    if (error) {
      setSavedCards(previous);
      Alert.alert('Saved Cards', 'Could not unsave this card. Please try again.');
    }
  };

  const handleUnsaveCreator = async (creator: SavedCreatorItem) => {
    if (!user) return;
    const previous = savedCreators;
    setSavedCreators((current) => current.filter((saved) => saved.creatorId !== creator.creatorId));

    const { error } = await supabase
      .from('saved_creators')
      .delete()
      .eq('user_id', user.id)
      .eq('creator_id', creator.creatorId);

    if (error) {
      setSavedCreators(previous);
      Alert.alert('Saved Creators', 'Could not unsave this creator. Please try again.');
    }
  };

  const handleModalShow = () => {};

  const loadInitialCollection = useCallback(async () => {
    if (!user) return;
    setLoadingCollection(true);
    try {
      if (activeSegment === 'saved_cards') {
        const response = await supabase.rpc('get_saved_listing_feed', {
          p_user_id: user.id,
          p_limit: COLLECTION_PAGE_SIZE,
          p_before_saved_at: null,
          p_before_autograph_id: null,
        });

        if (response.error) {
          console.log('Load saved cards error:', response.error);
          setSavedCards([]);
          setHasMoreCollection(false);
          return;
        }

        const nextItems = (response.data as (OwnedListingRow & { saved_at?: string | null })[] ?? []).map(mapSavedListingRow);
        setHasMoreCollection(nextItems.length === COLLECTION_PAGE_SIZE);
        setSavedCards(nextItems);
        return;
      }

      if (activeSegment === 'saved_creators') {
        const response = await supabase.rpc('get_saved_creators_feed', {
          p_user_id: user.id,
          p_limit: COLLECTION_PAGE_SIZE,
          p_before_saved_at: null,
          p_before_creator_id: null,
        });

        if (response.error) {
          console.log('Load saved creators error:', response.error);
          setSavedCreators([]);
          setHasMoreCollection(false);
          return;
        }

        const nextItems = (response.data as SavedCreatorRow[] ?? []).map(mapSavedCreatorRow);
        setHasMoreCollection(nextItems.length === COLLECTION_PAGE_SIZE);
        setSavedCreators(nextItems);
        return;
      }

      const response = await supabase.rpc('get_owned_listing_feed', {
        p_owner_id: user.id,
        p_limit: COLLECTION_PAGE_SIZE,
        p_before_created_at: null,
        p_before_id: null,
      });

      if (response.error) {
        console.log('Load autographs error:', response.error);
        setData([]);
        setHasMoreCollection(false);
        return;
      }

      const nextItems = (response.data as OwnedListingRow[] ?? []).map(mapOwnedListingRow);
      setHasMoreCollection(nextItems.length === COLLECTION_PAGE_SIZE);
      setData(nextItems);
    } finally {
      setLoadingCollection(false);
    }
  }, [activeSegment, user]);

  const loadMoreCollectionPage = useCallback(async (cursorItem?: AutographItem | null) => {
    if (!user || loadingMoreCollection || !hasMoreCollection) return;
    setLoadingMoreCollection(true);
    try {
      if (activeSegment === 'saved_cards') {
        const cursor = cursorItem;
        if (!cursor?.savedAt) return;
        const response = await supabase.rpc('get_saved_listing_feed', {
          p_user_id: user.id,
          p_limit: COLLECTION_PAGE_SIZE,
          p_before_saved_at: cursor.savedAt,
          p_before_autograph_id: cursor.id,
        });

        if (response.error) {
          console.log('Load more saved cards error:', response.error);
          return;
        }

        const nextItems = (response.data as (OwnedListingRow & { saved_at?: string | null })[] ?? []).map(mapSavedListingRow);
        setHasMoreCollection(nextItems.length === COLLECTION_PAGE_SIZE);
        setSavedCards((prev) => [...prev, ...nextItems]);
        return;
      }

      if (activeSegment === 'saved_creators') {
        const cursor = savedCreators[savedCreators.length - 1];
        if (!cursor) return;
        const response = await supabase.rpc('get_saved_creators_feed', {
          p_user_id: user.id,
          p_limit: COLLECTION_PAGE_SIZE,
          p_before_saved_at: cursor.savedAt,
          p_before_creator_id: cursor.creatorId,
        });

        if (response.error) {
          console.log('Load more saved creators error:', response.error);
          return;
        }

        const nextItems = (response.data as SavedCreatorRow[] ?? []).map(mapSavedCreatorRow);
        setHasMoreCollection(nextItems.length === COLLECTION_PAGE_SIZE);
        setSavedCreators((prev) => [...prev, ...nextItems]);
        return;
      }

      if (!cursorItem) return;
      const response = await supabase.rpc('get_owned_listing_feed', {
        p_owner_id: user.id,
        p_limit: COLLECTION_PAGE_SIZE,
        p_before_created_at: cursorItem.createdAt,
        p_before_id: cursorItem.id,
      });

      if (response.error) {
        console.log('Load more autographs error:', response.error);
        return;
      }

      const nextItems = (response.data as OwnedListingRow[] ?? []).map(mapOwnedListingRow);
      setHasMoreCollection(nextItems.length === COLLECTION_PAGE_SIZE);
      setData((prev) => [...prev, ...nextItems]);
    } finally {
      setLoadingMoreCollection(false);
    }
  }, [activeSegment, hasMoreCollection, loadingMoreCollection, savedCreators, user]);

  const loadOfferQueue = useCallback(async () => {
    if (!user || !DIGITAL_TRADING_ENABLED) {
      setIncomingOffers([]);
      return;
    }
    const offersRes = await supabase.rpc('get_offer_queue_feed', {
      p_owner_id: user.id,
      p_limit: 100,
      p_before_headline_amount: null,
      p_before_headline_created_at: null,
      p_before_autograph_id: null,
    });

    if (offersRes.error) {
      console.log('Load offers error:', offersRes.error);
      setIncomingOffers([]);
      return;
    }

    const offerRows = (offersRes.data as OfferQueueRow[] ?? []);
    setIncomingOffers(offerRows.map(mapOfferQueueRow));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;

      void (async () => {
        if (cancelled) return;
        await loadInitialCollection();
        if (!cancelled && DIGITAL_TRADING_ENABLED) {
          void loadOfferQueue();
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [loadInitialCollection, loadOfferQueue, user])
  );

  const handleIncomingOffer = async (offerId: string, action: 'accept' | 'decline') => {
    void offerId;
    void action;
  };

  const filteredData = useMemo(() => {
    if (activeSegment === 'saved_cards') return savedCards;
    if (activeSegment === 'saved_creators') return [];
    if (sort === 'newest') return [...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return [...data].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [activeSegment, data, savedCards, sort]);

  const collectionRows = useMemo<CollectionListRow[]>(() => {
    if (activeSegment === 'saved_creators') {
      return savedCreators.map((item) => ({ kind: 'creator', item }));
    }
    return filteredData.map((item) => ({
      kind: 'autograph',
      source: activeSegment === 'saved_cards' ? 'saved_cards' : 'created',
      item,
    }));
  }, [activeSegment, filteredData, savedCreators]);

  const selectedSeriesItems = useMemo(
    () => filteredData.filter((item) => selectedIds.has(item.id)),
    [filteredData, selectedIds]
  );

  const emptyComponent = useMemo(
    () => (
      loadingCollection ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={BrandColors.primary} />
          <Text style={styles.loadingStateText}>Loading collection…</Text>
        </View>
      ) : (
        <Text style={styles.emptyText}>
          {activeSegment === 'saved_cards'
            ? 'No saved moments yet.'
            : activeSegment === 'saved_creators'
              ? 'No saved creators yet.'
              : 'No autograph captures saved yet.'}
        </Text>
      )
    ),
    [activeSegment, loadingCollection]
  );

  const listFooter = useMemo(
    () => (
      loadingMoreCollection ? (
        <View style={styles.listFooter}>
          <ActivityIndicator size="small" color={BrandColors.primary} />
          <Text style={styles.loadingMoreText}>Loading more…</Text>
        </View>
      ) : null
    ),
    [loadingMoreCollection]
  );

  const listContentStyle = useMemo(
    () => ({
      ...styles.listContent,
      paddingBottom: insets.bottom + 88,
    }),
    [insets.bottom]
  );

  const autographMap = useMemo(
    () => Object.fromEntries(data.map((item) => [item.id, item])),
    [data]
  );

  const offersByAutograph = useMemo(() => {
    if (!DIGITAL_TRADING_ENABLED) return [];
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

  const segmentLabels: { key: CollectionSegment; label: string }[] = [
    { key: 'created', label: 'Captured' },
    { key: 'saved_cards', label: 'Saved Moments' },
    { key: 'saved_creators', label: 'Saved Creators' },
  ];

  const activeCount =
    activeSegment === 'saved_creators'
      ? savedCreators.length
      : activeSegment === 'saved_cards'
        ? savedCards.length
        : filteredData.length;
  const activeCountLabel =
    activeSegment === 'saved_creators'
      ? `${activeCount} creator${activeCount !== 1 ? 's' : ''}`
      : activeSegment === 'saved_cards'
        ? `${activeCount} saved moment${activeCount !== 1 ? 's' : ''}`
        : `${activeCount} moment${activeCount !== 1 ? 's' : ''}`;

  const listHeader = (
    <>
      {!seriesSelectionMode && (
        <View style={styles.collectionSegmentedControl}>
          {segmentLabels.map((segment) => (
            <Pressable
              key={segment.key}
              style={[styles.collectionSegmentOption, activeSegment === segment.key && styles.collectionSegmentOptionActive]}
              onPress={() => {
                handleCollectionSegmentChange(segment.key);
              }}
            >
              <Text style={[styles.collectionSegmentText, activeSegment === segment.key && styles.collectionSegmentTextActive]}>
                {segment.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
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
            <Text style={styles.filterResultCount}>{activeCountLabel}</Text>
            <View style={styles.headerButtons}>
              {activeSegment === 'created' ? (
                <>
                  <Pressable
                    style={[styles.filterButton, { borderWidth: 0 }]}
                    onPress={startSeriesSelection}
                  >
                    <Text style={styles.filterButtonText}>Create Series</Text>
                  </Pressable>
                  <View style={styles.sortToggle}>
                    <Pressable
                      style={[styles.sortOption, sort === 'newest' && styles.sortOptionActive]}
                      onPress={() => setSort('newest')}
                    >
                      <Text style={[styles.sortOptionText, sort === 'newest' && styles.sortOptionTextActive]}>Newest</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.sortOption, sort === 'oldest' && styles.sortOptionActive]}
                      onPress={() => setSort('oldest')}
                    >
                      <Text style={[styles.sortOptionText, sort === 'oldest' && styles.sortOptionTextActive]}>Oldest</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </View>
          </>
        )}
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={collectionRows}
        keyExtractor={(row) => row.kind === 'creator' ? `creator-${row.item.creatorId}` : `${row.source}-${row.item.id}`}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyComponent}
        ListFooterComponent={listFooter}
        contentContainerStyle={listContentStyle}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== 'web'}
        onEndReachedThreshold={0.35}
        onEndReached={() => {
          if (!seriesSelectionMode) {
            const cursor =
              activeSegment === 'saved_cards'
                ? savedCards[savedCards.length - 1] ?? null
                : activeSegment === 'created'
                  ? data[data.length - 1] ?? null
                  : null;
            void loadMoreCollectionPage(cursor);
          }
        }}
        renderItem={({ item: row }) => {
          if (row.kind === 'creator') {
            const creator = row.item;
            return (
              <Pressable
                style={styles.listRow}
                onPress={() => router.push(`/profile/${creator.creatorId}`)}
              >
                <View style={styles.listThumbWrap}>
                  <ProfileAvatar
                    name={creator.displayName}
                    uri={creator.avatarUrl}
                    videoUrl={creator.avatarAutograph?.video_url}
                    strokes={creator.avatarAutograph?.strokes_json ?? []}
                    captureWidth={creator.avatarAutograph?.capture_width ?? 1}
                    captureHeight={creator.avatarAutograph?.capture_height ?? 1}
                    strokeColor={creator.avatarAutograph?.stroke_color}
                    size={56}
                  />
                </View>
                <View style={styles.listRowInfo}>
                  <View style={styles.listRowTextBlock}>
                    <Text style={styles.listRowMeta} numberOfLines={1}>
                      {creator.displayName}
                    </Text>
                    <Text style={styles.listRowSeries} numberOfLines={1}>
                      Creator
                      {creator.printCount > 0 ? ` · ${creator.printCount} public print${creator.printCount !== 1 ? 's' : ''}` : ''}
                    </Text>
                    {creator.bio ? (
                      <Text style={styles.listRowSeries} numberOfLines={1}>
                        {creator.bio}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.listRowBottom}>
                    <Pressable
                      style={styles.savedRowBookmarkButton}
                      onPress={(event) => {
                        event.stopPropagation();
                        void handleUnsaveCreator(creator);
                      }}
                      hitSlop={10}
                    >
                      <FontAwesome name="bookmark" size={18} color={BrandColors.primary} />
                    </Pressable>
                    <Text style={styles.savedMetaText}>Saved {formatDateTime(creator.savedAt)}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }
          const item = row.item;
          const isSelectable = seriesSelectionMode && canCreateSeriesWithItem(item);
          const isSelected = selectedIds.has(item.id);
          return (
            <Pressable
              style={[styles.listRow, seriesSelectionMode && !isSelectable && styles.rowDisabled]}
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
                      Alert.alert('Series Limit', 'A series can include at most 50 moments.');
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
              <View style={styles.listThumbWrap}>
                <PublicVideoThumbnail
                  videoUrl={item.videoUri}
                  thumbnailUrl={item.thumbnailUrl}
                  previewFrameUrls={item.previewFrameUrls}
                  previewFrameTimesMs={item.previewFrameTimesMs}
                  strokes={item.strokes ?? []}
                  captureWidth={item.captureWidth || 1}
                  captureHeight={item.captureHeight || 1}
                  strokeColor={item.strokeColor}
                  shellStyle={styles.listThumbnail}
                />
                {seriesSelectionMode && (
                  <View style={[styles.selectionCheckCircle, isSelected && styles.selectionCheckCircleSelected, !isSelectable && styles.selectionCheckCircleDisabled]}>
                    {isSelected && <Text style={styles.selectionCheckTick}>✓</Text>}
                  </View>
                )}
              </View>
              <View style={styles.listRowInfo}>
                <View style={styles.listRowTextBlock}>
                  <Text style={styles.listRowMeta} numberOfLines={1}>
                    {[
                      item.creatorSequenceNumber != null ? `#${item.creatorSequenceNumber}` : null,
                      formatCardDate(item.createdAt),
                    ].filter(Boolean).join(' · ')}
                  </Text>
                  {(item.seriesName || formatSeriesEdition(item)) ? (
                    <Text style={styles.listRowSeries} numberOfLines={1}>
                      {[item.seriesName, formatSeriesEdition(item)].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                  {row.source === 'created' ? (
                    <Text style={styles.listRowSeries} numberOfLines={1}>
                      Printed {item.printCount ?? 0} {(item.printCount ?? 0) === 1 ? 'time' : 'times'}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.listRowBottom}>
                  {row.source === 'created' ? (
                    <>
                      <View style={styles.listRowBottomSpacer} />
                      <Pressable
                        style={[styles.publicPrintsButton, item.printsEnabled ? styles.publicPrintsButtonOn : styles.publicPrintsButtonOff]}
                        onPress={(event) => {
                          event.stopPropagation();
                          void handleTogglePrintsEnabled(item);
                        }}
                      >
                        <Text style={[styles.publicPrintsButtonText, item.printsEnabled ? styles.publicPrintsButtonTextOn : styles.publicPrintsButtonTextOff]}>
                          {item.printsEnabled ? 'Public Prints On' : 'Public Prints Off'}
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        style={styles.savedRowBookmarkButton}
                        onPress={(event) => {
                          event.stopPropagation();
                          void handleUnsaveCard(item);
                        }}
                        hitSlop={10}
                      >
                        <FontAwesome name="bookmark" size={18} color={BrandColors.primary} />
                      </Pressable>
                      <Pressable
                        style={[styles.publicPrintsButton, styles.buyPrintButton]}
                        onPress={(event) => {
                          event.stopPropagation();
                          void openPrintPreview(item);
                        }}
                      >
                        <Text style={[styles.publicPrintsButtonText, styles.buyPrintButtonText]}>
                          Print Preview
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
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
                <Text style={[styles.modalMetaLine, styles.modalMetaCentered]}>
                  {[
                    selectedItem.creatorSequenceNumber != null ? `#${selectedItem.creatorSequenceNumber}` : null,
                    formatCardDate(selectedItem.createdAt),
                  ].filter(Boolean).join(' · ')}
                </Text>
                {selectedItem.seriesName || formatSeriesEdition(selectedItem) ? (
                  <Text style={[styles.modalMetaLine, styles.modalMetaCentered]} numberOfLines={1}>
                    {[selectedItem.seriesName, formatSeriesEdition(selectedItem)].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                <View style={styles.modalUtilityRow}>
                  <Pressable style={styles.modalUtilityButton} onPress={() => { void shareAutograph(selectedItem); }}>
                    <Text style={styles.modalUtilityButtonText}>Share</Text>
                  </Pressable>
                  <Pressable
                    style={styles.modalUtilityButton}
                    onPress={() => { void openPrintPreview(selectedItem); }}
                  >
                    <Text style={styles.modalUtilityButtonText}>Print Preview</Text>
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
                    {loadingPrintPreview ? 'Loading Print Preview…' : 'Print Preview'}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.contextMenuItem}
                  onPress={() => {
                    const item = selectedItem;
                    setContextMenuVisible(false);
                    void handleTogglePrintsEnabled(item);
                  }}
                >
                  <Text style={styles.contextMenuItemText}>
                    {selectedItem.printsEnabled ? 'Disable Prints' : 'Enable Prints'}
                  </Text>
                </Pressable>

                {(selectedItem.printCount ?? 0) > 0 && (
                  <Pressable
                    style={styles.contextMenuItem}
                    onPress={async () => {
                      const item = selectedItem;
                      setContextMenuVisible(false);
                      closeModal();
                      // Fetch the user's active print for this autograph
                      const { data: print } = await supabase
                        .from('autograph_prints')
                        .select('id')
                        .eq('autograph_id', item.id)
                        .eq('owner_id_at_print', user?.id)
                        .eq('status', 'created')
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                      if (!print) {
                        Alert.alert('No Print Found', 'We could not find an active print for this autograph.');
                        return;
                      }
                      setDamageClaim({
                        printId: print.id,
                        autographId: item.id,
                        step: 'form',
                        claimType: 'damaged',
                        reasonCode: null,
                        frontPhotoUri: null,
                        backPhotoUri: null,
                        destructionPhotoUri: null,
                        submitting: false,
                      });
                    }}
                  >
                    <Text style={styles.contextMenuItemText}>Report Print Issue</Text>
                  </Pressable>
                )}

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
              {selectedSeriesItems.length} moment{selectedSeriesItems.length !== 1 ? 's' : ''} · oldest to newest
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
              This will create a locked series of {selectedSeriesItems.length} moments ordered oldest to newest. The moments and order cannot be changed later.
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

      <AutographPrintModal
        visible={!!printItem}
        printItem={printItem}
        printPreview={printPreview}
        printStep={printStep}
        addressSheetVisible={addressSheetVisible}
        creatingPrint={creatingPrint}
        loadingPrintPreview={loadingPrintPreview}
        quantity={printQuantity}
        onQuantityChange={setPrintQuantity}
        onClose={closePrintPreview}
        onProceedToPayment={handleProceedToPayment}
        onAddressSubmit={handleAddressSubmit}
        onAddressError={() => setAddressSheetVisible(false)}
        formatCardDate={formatCardDate}
      />

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
            {damageClaim?.step === 'form' && (
              <>
                <Text style={styles.certTitle}>Report Print Issue</Text>

                {/* Claim type selector */}
                <Text style={[styles.printInfoText, { textAlign: 'left', marginBottom: 8 }]}>What happened?</Text>
                <View style={styles.claimTypeRow}>
                  <Pressable
                    style={[styles.claimTypeButton, damageClaim.claimType === 'damaged' && styles.claimTypeButtonSelected]}
                    onPress={() => setDamageClaim((prev) => prev ? ({ ...prev, claimType: 'damaged' }) : prev)}
                  >
                    <Text style={[styles.claimTypeButtonText, damageClaim.claimType === 'damaged' && styles.claimTypeButtonTextSelected]}>
                      Arrived Damaged
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.claimTypeButton, damageClaim.claimType === 'lost' && styles.claimTypeButtonSelected]}
                    onPress={() => setDamageClaim((prev) => prev ? ({ ...prev, claimType: 'lost' }) : prev)}
                  >
                    <Text style={[styles.claimTypeButtonText, damageClaim.claimType === 'lost' && styles.claimTypeButtonTextSelected]}>
                      Never Arrived
                    </Text>
                  </Pressable>
                </View>

                {/* Reason selector — damaged only */}
                {damageClaim.claimType === 'damaged' && (
                  <>
                    <Text style={[styles.printInfoText, { textAlign: 'left', marginBottom: 8, marginTop: 16 }]}>Reason</Text>
                    {(
                      [
                        { code: 'damaged_in_shipping', label: 'Damaged in shipping' },
                        { code: 'print_defect', label: 'Print defect' },
                        { code: 'wrong_item', label: 'Wrong item received' },
                        { code: 'other', label: 'Other' },
                      ] as const
                    ).map(({ code, label }) => (
                      <Pressable
                        key={code}
                        style={styles.reasonOption}
                        onPress={() => setDamageClaim((prev) => prev ? ({ ...prev, reasonCode: code }) : prev)}
                      >
                        <View style={[styles.reasonRadio, damageClaim.reasonCode === code && styles.reasonRadioSelected]} />
                        <Text style={styles.reasonLabel}>{label}</Text>
                      </Pressable>
                    ))}
                  </>
                )}

                {/* Photos — damaged only */}
                {damageClaim.claimType === 'damaged' && (
                  <>
                    <Text style={[styles.printInfoText, { textAlign: 'left', marginBottom: 8, marginTop: 20 }]}>Front of print (QR code visible)</Text>
                    <Pressable style={styles.photoPickerBox} onPress={() => pickDamagePhoto('front')}>
                      {damageClaim.frontPhotoUri
                        ? <Image source={{ uri: damageClaim.frontPhotoUri }} style={styles.photoPickerPreview} />
                        : <Text style={styles.photoPickerLabel}>Tap to select photo</Text>}
                    </Pressable>

                    <Text style={[styles.printInfoText, { textAlign: 'left', marginBottom: 8, marginTop: 16 }]}>Back of print (date visible)</Text>
                    <Pressable style={styles.photoPickerBox} onPress={() => pickDamagePhoto('back')}>
                      {damageClaim.backPhotoUri
                        ? <Image source={{ uri: damageClaim.backPhotoUri }} style={styles.photoPickerPreview} />
                        : <Text style={styles.photoPickerLabel}>Tap to select photo</Text>}
                    </Pressable>

                    <Text style={[styles.printInfoText, { textAlign: 'left', marginBottom: 4, marginTop: 16 }]}>Print cut in half (QR code visible)</Text>
                    <Text style={[styles.certDate, { textAlign: 'left', marginBottom: 8, fontSize: 11 }]}>
                      To protect collectible authenticity, only one physical print may exist per autograph. Please cut the damaged print in half before submitting.
                    </Text>
                    <Pressable style={styles.photoPickerBox} onPress={() => pickDamagePhoto('destruction')}>
                      {damageClaim.destructionPhotoUri
                        ? <Image source={{ uri: damageClaim.destructionPhotoUri }} style={styles.photoPickerPreview} />
                        : <Text style={styles.photoPickerLabel}>Tap to select photo</Text>}
                    </Pressable>
                  </>
                )}

                {/* Lost — explanatory note */}
                {damageClaim.claimType === 'lost' && (
                  <Text style={[styles.printInfoText, { marginTop: 16 }]}>
                    We will review your order with our print partner. This typically resolves within 5 business days. You will be notified through the app with an update.
                  </Text>
                )}

                <Pressable
                  style={[styles.certCloseButton, { marginTop: 20 }, damageClaim.submitting && { opacity: 0.5 }]}
                  onPress={handleSubmitClaim}
                  disabled={damageClaim.submitting}
                >
                  <Text style={styles.closeButtonText}>
                    {damageClaim.submitting ? 'Submitting…' : 'Submit Claim'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setDamageClaim(null)} style={{ marginTop: 12 }} disabled={damageClaim.submitting}>
                  <Text style={styles.certDate}>Cancel</Text>
                </Pressable>
              </>
            )}

            {damageClaim?.step === 'submitted' && (
              <>
                <Text style={styles.certTitle}>Claim Submitted</Text>
                <Text style={styles.printInfoText}>
                  {damageClaim.claimType === 'lost'
                    ? 'Your lost print report has been received. We will review your order with our print partner and contact you within a few business days.'
                    : 'Your damage claim has been received. Ophinia will review your photos and contact you within a few business days.'}
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


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: BrandColors.background,
  },
  listContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  listFooter: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 13,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  loadingStateText: {
    fontSize: 14,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  sortToggle: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    overflow: 'hidden',
  },
  sortOption: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  sortOptionActive: {
    backgroundColor: BrandColors.primary,
  },
  sortOptionText: {
    fontSize: 13,
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
    color: '#555',
  },
  sortOptionTextActive: {
    color: '#fff',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  listThumbWrap: {
    position: 'relative',
  },
  listThumbnail: {
    width: 56,
    height: 93,
    borderRadius: 0,
    backgroundColor: '#d9d9d9',
    overflow: 'hidden',
  },
  listRowInfo: {
    flex: 1,
    marginLeft: 14,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingBottom: 10,
  },
  listRowTextBlock: {
    gap: 3,
  },
  listRowMeta: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
    color: '#111',
  },
  listRowSeries: {
    fontSize: 13,
    fontFamily: BrandFonts.primary,
    color: '#666',
  },
  listRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  listRowBottomSpacer: {
    width: 24,
    height: 24,
  },
  savedRowBookmarkButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listedBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#001B5C',
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
  publicPrintsButton: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 7,
  },
  publicPrintsButtonOn: {
    backgroundColor: '#1A7F37',
  },
  publicPrintsButtonOff: {
    backgroundColor: '#D7DADF',
  },
  publicPrintsButtonText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
    textAlign: 'center',
  },
  publicPrintsButtonTextOn: {
    color: '#fff',
  },
  publicPrintsButtonTextOff: {
    color: '#4B5563',
  },
  buyPrintButton: {
    backgroundColor: BrandColors.primary,
  },
  buyPrintButtonText: {
    color: '#fff',
  },
  savedMetaText: {
    color: '#777',
    fontSize: 12,
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
    borderRadius: 0,
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
  offerRetryButton: {
    marginTop: 10,
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
  modalMetaCentered: {
    textAlign: 'center',
    width: '100%',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  modalUtilityButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  modalUtilityButtonNavy: {
    backgroundColor: BrandColors.primary,
    borderColor: BrandColors.primary,
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
    marginTop: 16,
    marginBottom: 12,
  },
  collectionSegmentedControl: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 2,
    borderRadius: 999,
    backgroundColor: '#EDEFF3',
    padding: 3,
  },
  collectionSegmentOption: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  collectionSegmentOptionActive: {
    backgroundColor: BrandColors.primary,
  },
  collectionSegmentText: {
    color: '#555',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
    textAlign: 'center',
  },
  collectionSegmentTextActive: {
    color: '#fff',
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
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
    color: '#666',
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
  claimTypeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  claimTypeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
  },
  claimTypeButtonSelected: {
    borderColor: BrandColors.primary,
    backgroundColor: `${BrandColors.primary}15`,
  },
  claimTypeButtonText: {
    fontSize: 14,
    fontFamily: BrandFonts.primary,
    color: '#555',
  },
  claimTypeButtonTextSelected: {
    color: BrandColors.primary,
    fontWeight: '700',
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  reasonRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#ccc',
  },
  reasonRadioSelected: {
    borderColor: BrandColors.primary,
    backgroundColor: BrandColors.primary,
  },
  reasonLabel: {
    fontSize: 14,
    fontFamily: BrandFonts.primary,
    color: '#333',
  },
});

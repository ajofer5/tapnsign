import {
  AutographCardCanvas,
  CardStroke,
} from '@/components/autograph-card-canvas';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BrandColors, BrandFonts } from '@/constants/theme';
import { callEdgeFunction } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { CAPTURE_COUNTDOWN_START, CAPTURE_DURATION_MS, PREVIEW_FRAME_TIMES_MS } from '@/lib/capture-timing';
import { CardTemplate, DISPLAY_CARD_TEMPLATES, getCardTemplate, OPHINIA_O_CARD_TEMPLATE } from '@/lib/card-templates';
import { supabase } from '@/lib/supabase';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';

type CapturePhase = 'style-pick' | 'idle' | 'recording' | 'snapshot' | 'review';

const GOLD_COLOR = '#F1C168';
const NAVY_COLOR = '#001B5C';
const BLUE_COLOR = '#FA0909';
const VIOLET_COLOR = BrandColors.violet;
const DEFAULT_TEMPLATE_STROKE = NAVY_COLOR;

const STROKE_OPTIONS = [
  { id: 'navy', label: 'Navy', color: NAVY_COLOR },
  { id: 'blue', label: 'Red', color: BLUE_COLOR },
  { id: 'violet', label: 'Violet', color: VIOLET_COLOR },
  { id: 'gold', label: 'Gold', color: GOLD_COLOR },
] as const;

const CAPTURE_SETTINGS_KEY = 'capture:last-settings:v1';

type PersonalizedRequestContext = {
  id: string;
  recipient_name: string;
  inscription_text: string | null;
  requester_note: string | null;
  requester?: { display_name?: string | null } | null;
};

type Stroke = CardStroke;
type CapturedFrame = { uri: string; t: number };

const FLATTENED_PREVIEW_FRAME_EXPORT_WIDTH = 1200;
const FLATTENED_HERO_FRAME_EXPORT_WIDTH = 1200;

function normalizeCapturedFrames(rawFrames: CapturedFrame[]): CapturedFrame[] {
  if (!rawFrames.length) return [];

  const sorted = [...rawFrames].sort((a, b) => a.t - b.t);
  return PREVIEW_FRAME_TIMES_MS.map((timeMs) => {
    const targetTimeSeconds = timeMs / 1000;
    let best = sorted[0];
    let bestDistance = Math.abs(sorted[0].t - targetTimeSeconds);

    for (let index = 1; index < sorted.length; index += 1) {
      const candidate = sorted[index];
      const distance = Math.abs(candidate.t - targetTimeSeconds);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }

    return { uri: best.uri, t: targetTimeSeconds };
  });
}

function getFlattenedNameScale(template: CardTemplate, creatorName: string) {
  const baseScale = (FLATTENED_PREVIEW_FRAME_EXPORT_WIDTH / template.baseWidth) * 0.82;
  const trimmedName = creatorName.trim();
  if (trimmedName.length <= 18) return baseScale;
  if (trimmedName.length <= 24) return baseScale * 0.94;
  return baseScale * 0.9;
}

export default function CaptureScreen() {
  const { personalized_request_id } = useLocalSearchParams<{ personalized_request_id?: string }>();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const { width: screenW, height: screenH } = useWindowDimensions();
  // Largest 3:5 card that fits within both screen dimensions, with padding
  const cardW = Math.min(screenW, (screenH * 0.92) * (3 / 5));
  const cardH = cardW * (5 / 3);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(OPHINIA_O_CARD_TEMPLATE.id);
  const captureTemplate = getCardTemplate(selectedTemplateId);

  const [capturePhase, setCapturePhase] = useState<CapturePhase>('idle');
  const [strokeColor, setStrokeColor] = useState<string>(NAVY_COLOR);
  const [settingsReady, setSettingsReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(CAPTURE_COUNTDOWN_START);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [captureSize, setCaptureSize] = useState({ width: 1, height: 1 });
  const [uploading, setUploading] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  // Camera photos captured during recording, with stroke timestamps for replay
  const [capturedFrames, setCapturedFrames] = useState<CapturedFrame[]>([]);
  // Set when recording ends; drives review phase
  const [reviewData, setReviewData] = useState<{ strokes: Stroke[]; strokeColor: string } | null>(null);
  // Selfie captured after recording ends
  const [personalizedRequest, setPersonalizedRequest] = useState<PersonalizedRequestContext | null>(null);
  const [loadingPersonalizedRequest, setLoadingPersonalizedRequest] = useState(false);

  const startedRef = useRef(false);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the per-frame capture timeouts so we can clear them on retake
  const frameTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const capturedFramesRef = useRef<CapturedFrame[]>([]);
  const cameraRef = useRef<CameraView>(null);
  const flattenedFrameCardRefs = useRef<(View | null)[]>([]);

  const router = useRouter();
  const navigation = useNavigation();
  const { user, profile } = useAuth();

  useEffect(() => {
    let alive = true;

    AsyncStorage.getItem(CAPTURE_SETTINGS_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        try {
          const parsed = JSON.parse(raw) as { templateId?: string; strokeColor?: string };
          if (parsed.templateId) {
            setSelectedTemplateId(getCardTemplate(parsed.templateId).id);
          }
          if (parsed.strokeColor && STROKE_OPTIONS.some((option) => option.color === parsed.strokeColor)) {
            setStrokeColor(parsed.strokeColor);
          }
        } catch {}
      })
      .finally(() => {
        if (alive) setSettingsReady(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadPersonalizedRequest = async () => {
      if (!user || !personalized_request_id || typeof personalized_request_id !== 'string') {
        if (alive) setPersonalizedRequest(null);
        return;
      }

      setLoadingPersonalizedRequest(true);
      const { data, error } = await supabase
        .from('personalized_autograph_requests')
        .select(`
          id,
          creator_id,
          recipient_name,
          inscription_text,
          requester_note,
          status,
          requester:requester_id ( display_name )
        `)
        .eq('id', personalized_request_id)
        .eq('creator_id', user.id)
        .eq('status', 'accepted')
        .maybeSingle();

      if (!alive) return;
      if (error || !data) {
        setPersonalizedRequest(null);
        Alert.alert('Personalized Request Unavailable', 'That personalized request is no longer ready for capture.');
        router.replace('/personalized-requests');
      } else {
        setPersonalizedRequest(data as PersonalizedRequestContext);
      }
      setLoadingPersonalizedRequest(false);
    };

    void loadPersonalizedRequest();
    return () => {
      alive = false;
    };
  }, [user, personalized_request_id, router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: capturePhase === 'idle' && !uploading,
    });
    return () => {
      navigation.setOptions({ headerShown: true });
    };
  }, [navigation, capturePhase, uploading]);

  useEffect(() => {
    if (!started) return;
    const updateTimeLeft = () => {
      if (!recordingStartTimeRef.current) return;
      const elapsedMs = Date.now() - recordingStartTimeRef.current;
      const remainingMs = Math.max(0, CAPTURE_DURATION_MS - elapsedMs);
      setTimeLeft(Math.min(7, Math.ceil(remainingMs / 1000)));
    };

    updateTimeLeft();
    const timer = setInterval(updateTimeLeft, 100);
    return () => clearInterval(timer);
  }, [started]);

  const getElapsedTimeSeconds = () => {
    if (!recordingStartTimeRef.current) return 0;
    return Number(((Date.now() - recordingStartTimeRef.current) / 1000).toFixed(3));
  };

  const resetState = () => {
    startedRef.current = false;
    strokesRef.current = [];
    currentStrokeRef.current = null;
    recordingStartTimeRef.current = null;
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    for (const t of frameTimeoutsRef.current) clearTimeout(t);
    frameTimeoutsRef.current = [];
    capturedFramesRef.current = [];
    setStarted(false);
    setTimeLeft(CAPTURE_COUNTDOWN_START);
    setStrokes([]);
    setCurrentStroke(null);
    setUploading(false);
    setSubmittingReview(false);
    setCapturePhase('idle');
    setCapturedFrames([]);
    setReviewData(null);
  };

  const finalizeCurrentStroke = () => {
    const activeStroke = currentStrokeRef.current;
    if (activeStroke && activeStroke.points.length > 0) {
      const updated = [...strokesRef.current, activeStroke];
      strokesRef.current = updated;
      setStrokes(updated);
      currentStrokeRef.current = null;
      setCurrentStroke(null);
    }
  };

  const isPointInsideSignaturePad = (x: number, y: number) => {
    void x;
    void y;
    return true;
  };

  const beginStroke = (x: number, y: number) => {
    if (!startedRef.current) return;
    const newStroke: Stroke = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      points: [{ x, y, t: getElapsedTimeSeconds() }],
    };
    currentStrokeRef.current = newStroke;
    setCurrentStroke(newStroke);
  };

  const appendPointToStroke = (x: number, y: number) => {
    if (!startedRef.current || !currentStrokeRef.current) return;
    const updatedStroke: Stroke = {
      ...currentStrokeRef.current,
      points: [
        ...currentStrokeRef.current.points,
        { x, y, t: getElapsedTimeSeconds() },
      ],
    };
    currentStrokeRef.current = updatedStroke;
    setCurrentStroke(updatedStroke);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => startedRef.current,
      onMoveShouldSetPanResponder: () => startedRef.current,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        if (!isPointInsideSignaturePad(locationX, locationY)) return;
        beginStroke(locationX, locationY);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        appendPointToStroke(locationX, locationY);
      },
      onPanResponderRelease: () => finalizeCurrentStroke(),
      onPanResponderTerminate: () => finalizeCurrentStroke(),
    })
  ).current;

  const handleCaptureShellLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setCaptureSize({ width, height });
  };

  const handleStart = async () => {
    if (startedRef.current) return;

    if (!user) {
      Alert.alert('Not signed in', 'Please sign in before capturing an autograph.');
      return;
    }

    if (profile?.role !== 'verified' || profile?.verification_status !== 'verified') {
      Alert.alert('Verified accounts only', 'Only verified accounts can capture autographs.');
      return;
    }

    try {
      capturedFramesRef.current = [];
      setCapturedFrames([]);
      setStarted(true);
      setCapturePhase('recording');
      startedRef.current = true;
      setTimeLeft(CAPTURE_COUNTDOWN_START);
      setStrokes([]);
      setCurrentStroke(null);
      strokesRef.current = [];
      currentStrokeRef.current = null;
      recordingStartTimeRef.current = Date.now();
      // Capture raw front-camera frames; card composition happens in the shared renderer.
      for (const ms of PREVIEW_FRAME_TIMES_MS) {
        const frameT = ms / 1000; // seconds into recording
        const t = setTimeout(async () => {
          if (!startedRef.current || !cameraRef.current) return;
          try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.82, shutterSound: false });
            if (photo?.uri) {
              capturedFramesRef.current = [...capturedFramesRef.current, { uri: photo.uri, t: frameT }];
            }
          } catch {
            // missed frame — continue
          }
        }, ms);
        frameTimeoutsRef.current.push(t);
      }

      // Stop after the capture window — wait briefly for the last camera frame, then enter review
      stopTimeoutRef.current = setTimeout(async () => {
        finalizeCurrentStroke();
        startedRef.current = false;
        setStarted(false);
        setCapturePhase('snapshot');

        const finalizedStrokes = [...strokesRef.current];
        const finalColor = strokeColor;

        await new Promise((resolve) => setTimeout(resolve, 400));
        const allFrames = normalizeCapturedFrames(capturedFramesRef.current);

        setCapturedFrames(allFrames);
        setReviewData({
          strokes: finalizedStrokes,
          strokeColor: finalColor,
        });
        setCapturePhase('review');
      }, CAPTURE_DURATION_MS);
    } catch {
      Alert.alert('Capture Failed', 'Something went wrong while capturing. Please try again.');
      resetState();
    }
  };

  const handleSubmit = async () => {
    if (!reviewData || !user || capturedFrames.length === 0) return;
    const { strokes: finalizedStrokes, strokeColor } = reviewData;

    setSubmittingReview(true);
    setUploading(true);

    try {
      const flattenedFrameUris = await Promise.all(
        capturedFrames.map(async (_frame, index) => {
          const ref = flattenedFrameCardRefs.current[index];
          if (!ref) {
            throw new Error('Could not prepare the autograph card preview frames.');
          }

          const exportWidth = index === capturedFrames.length - 1
            ? FLATTENED_HERO_FRAME_EXPORT_WIDTH
            : FLATTENED_PREVIEW_FRAME_EXPORT_WIDTH;
          const exportHeight = Math.round(
            exportWidth * (captureTemplate.aspectRatio.height / captureTemplate.aspectRatio.width)
          );

          return captureRef(ref, {
            format: 'jpg',
            quality: 0.98,
            result: 'tmpfile',
            width: exportWidth,
            height: exportHeight,
            pixelRatio: index === capturedFrames.length - 1 ? 3 : 1,
            useRenderInContext: true,
          });
        })
      );

      const uploadTargets = await callEdgeFunction<{
        preview_frames: { path: string; signedUrl: string; token: string }[];
      }>('create-capture-upload-targets', {
        include_video: false,
        include_thumbnail: false,
        preview_frame_count: flattenedFrameUris.length,
      });

      const uploadPreviewFramesPromise = Promise.all(
        flattenedFrameUris.map(async (frameUri, index) => {
          const target = uploadTargets.preview_frames?.[index];
          if (!target || !frameUri) return;
          const frameForm = new FormData();
          frameForm.append('', {
            uri: frameUri,
            name: target.path.split('/').pop() ?? `capture-preview-${index + 1}.jpg`,
            type: 'image/jpeg',
          } as any);
          const { error: previewUploadError } = await supabase.storage
            .from('autograph-videos')
            .uploadToSignedUrl(target.path, target.token, frameForm);
          if (previewUploadError) throw new Error(previewUploadError.message ?? 'Preview frame upload failed');
        })
      );

      await uploadPreviewFramesPromise;

      const insertedAutograph = await callEdgeFunction<{
        autograph: {
          id: string;
          certificate_id: string;
          visibility: 'private' | 'public';
          sale_state: 'not_for_sale' | 'fixed';
          is_for_sale: boolean;
          content_hash: string;
          creator_sequence_number: number | null;
        };
      }>('mint-autograph', {
        video_path: null,
        thumbnail_path: null,
        preview_frame_paths: (uploadTargets.preview_frames ?? []).map((frame: { path: string }) => frame.path),
        preview_frame_times_ms: PREVIEW_FRAME_TIMES_MS,
        strokes_json: finalizedStrokes,
        capture_width: Math.max(1, Math.round(captureSize.width)),
        capture_height: Math.max(1, Math.round(captureSize.height)),
        stroke_color: strokeColor,
        template_id: captureTemplate.id,
        personalized_request_id: personalizedRequest?.id ?? null,
      });

      console.log('Autograph mint succeeded', insertedAutograph);
      resetState();
      router.replace(personalizedRequest ? '/personalized-requests' : '/autographs');
    } catch (error: any) {
      console.log('Capture error:', { message: error?.message, details: error?.details, hint: error?.hint, code: error?.code });
      const detail = error?.message || error?.details || error?.hint || 'Something went wrong while saving your autograph. Please try again.';
      Alert.alert('Capture Failed', detail);
      resetState();
    }
  };

  const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

  const persistCaptureSettings = async (templateId: string, nextStrokeColor: string) => {
    try {
      await AsyncStorage.setItem(
        CAPTURE_SETTINGS_KEY,
        JSON.stringify({ templateId, strokeColor: nextStrokeColor })
      );
    } catch {}
  };

  const handleStylePickerContinue = async () => {
    await persistCaptureSettings(selectedTemplateId, strokeColor);
    setCapturePhase('idle');
  };

  if (!cameraPermission) {
    return <View style={styles.permissionContainer} />;
  }

  if (!settingsReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BrandColors.primary} />
        <Text style={styles.loadingText}>Loading capture…</Text>
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Camera permission required</Text>
        <Pressable style={styles.permissionButton} onPress={requestCameraPermission}>
          <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
        </Pressable>
      </View>
    );
  }

  if (loadingPersonalizedRequest) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BrandColors.primary} />
        <Text style={styles.loadingText}>Loading request…</Text>
      </View>
    );
  }

  // Style picker — shown before capture begins
  if (capturePhase === 'style-pick') {
    return (
      <StylePickScreen
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={setSelectedTemplateId}
        selectedStrokeColor={strokeColor}
        onSelectStrokeColor={setStrokeColor}
        onContinue={handleStylePickerContinue}
      />
    );
  }

  // Snapshot phase — brief spinner while selfie is captured
  // The loading spinner is shown to the user while selfie + card assembly completes
  if (capturePhase === 'snapshot') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BrandColors.primary} />
        <Text style={styles.loadingText}>Preparing your card…</Text>
      </View>
    );
  }

  // Review phase
  if (capturePhase === 'review' && reviewData) {
    return (
      <>
        <ReviewScreen
          template={captureTemplate}
          creatorName={profile?.display_name ?? ''}
          flattenedFrameCardRefs={flattenedFrameCardRefs}
          capturedFrames={capturedFrames}
          reviewData={reviewData}
          captureSize={captureSize}
          onRetake={resetState}
          onSubmit={handleSubmit}
          submitting={submittingReview}
        />
      </>
    );
  }

  if (uploading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BrandColors.primary} />
        <Text style={styles.loadingText}>Saving autograph…</Text>
      </View>
    );
  }

  // Idle / recording — the live card view
  return (
    <View style={styles.container}>
      {!started && (
        <Pressable style={styles.editStyleButton} onPress={() => setCapturePhase('style-pick')}>
          <Text style={styles.editStyleButtonText}>Edit Capture Style</Text>
        </Pressable>
      )}
      {started && (
        <View style={styles.timerCircle}>
          <Text style={styles.timerText}>{timeLeft}</Text>
        </View>
      )}
      <View
        style={[styles.captureShell, { width: cardW, height: cardH }]}
        onLayout={handleCaptureShellLayout}
      >
        <AutographCardCanvas
          template={captureTemplate}
          creatorName={profile?.display_name ?? ''}
          captureWidth={captureSize.width}
          captureHeight={captureSize.height}
          strokes={allStrokes}
          strokeColor={strokeColor}
          cameraContent={
            <CameraView ref={cameraRef} style={styles.camera} facing="front" zoom={0} />
          }
        />

        {!started && capturePhase === 'idle' ? (
          <Pressable style={styles.startOverlay} onPress={handleStart} />
        ) : null}

        <View
          style={styles.captureGestureLayer}
          pointerEvents={started ? 'auto' : 'none'}
          {...panResponder.panHandlers}
        />
      </View>

      {!started && capturePhase === 'idle' ? (
        <Pressable onPress={handleStart}>
          <Text style={styles.tapToSignText}>Tap the screen to sign</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── StylePickScreen ──────────────────────────────────────────────────────────

function StylePickScreen({
  selectedTemplateId,
  onSelectTemplate,
  selectedStrokeColor,
  onSelectStrokeColor,
  onContinue,
}: {
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  selectedStrokeColor: string;
  onSelectStrokeColor: (color: string) => void;
  onContinue: () => void;
}) {
  const selectedTemplate = DISPLAY_CARD_TEMPLATES.find((template) => template.id === selectedTemplateId) ?? DISPLAY_CARD_TEMPLATES[0];

  return (
    <View style={stylePickStyles.container}>
      <Text style={stylePickStyles.heading}>Choose your card template</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={stylePickStyles.carouselContent}
        snapToInterval={244}
        decelerationRate="fast"
      >
        {DISPLAY_CARD_TEMPLATES.map((template) => {
          const isSelected = selectedTemplateId === template.id;
          return (
            <Pressable
              key={template.id}
              style={[stylePickStyles.optionTile, isSelected && stylePickStyles.optionTileSelected]}
              onPress={() => onSelectTemplate(template.id)}
            >
              <View style={stylePickStyles.cardPreviewWrapper}>
                {template.id === 'ophinia_o' ? (
                  <Image
                    source={require('../assets/images/Ophinia_O template.png')}
                    style={stylePickStyles.logoPreviewImage}
                    resizeMode="contain"
                  />
                ) : (
                  <AutographCardCanvas
                    template={template}
                    creatorName=""
                    captureWidth={template.baseWidth}
                    captureHeight={template.baseHeight}
                    strokes={[]}
                    strokeColor={NAVY_COLOR}
                    style={stylePickStyles.cardPreview}
                  />
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={stylePickStyles.selectionMeta}>
        <Text style={stylePickStyles.optionLabelSelected}>{selectedTemplate.name}</Text>
        <View style={stylePickStyles.selectedDot} />
      </View>

      <Text style={stylePickStyles.subheading}>Choose your stroke color</Text>
      <View style={stylePickStyles.swatchRow}>
        {STROKE_OPTIONS.map((option) => {
          const isSelected = selectedStrokeColor === option.color;
          return (
            <Pressable
              key={option.id}
              style={stylePickStyles.swatchOption}
              onPress={() => onSelectStrokeColor(option.color)}
            >
              <View style={[stylePickStyles.swatchCircle, { backgroundColor: option.color }, isSelected && stylePickStyles.swatchCircleSelected]} />
              <Text style={[stylePickStyles.swatchLabel, isSelected && stylePickStyles.swatchLabelSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={stylePickStyles.continueButton} onPress={onContinue}>
        <Text style={stylePickStyles.continueButtonText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const stylePickStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C132B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  heading: {
    color: '#F6F6F2',
    fontFamily: BrandFonts.primary,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 28,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  subheading: {
    color: '#F6F6F2',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 18,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  carouselContent: {
    paddingHorizontal: 28,
    gap: 20,
    alignItems: 'center',
    marginBottom: 22,
  },
  optionTile: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 224,
    padding: 14,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  optionTileSelected: {
    borderColor: '#F1C168',
    backgroundColor: 'rgba(241,193,104,0.06)',
  },
  cardPreviewWrapper: {
    width: 180,
    aspectRatio: 60 / 100,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardPreview: {
    flex: 1,
  },
  logoPreviewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
  },
  selectionMeta: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 26,
  },
  optionLabel: {
    color: 'rgba(246,246,242,0.6)',
    fontFamily: BrandFonts.primary,
    fontSize: 13,
    fontWeight: '500',
  },
  optionLabelSelected: {
    color: '#F6F6F2',
    fontFamily: BrandFonts.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F1C168',
  },
  swatchRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 34,
  },
  swatchOption: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  swatchCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  swatchCircleSelected: {
    borderColor: '#F6F6F2',
    transform: [{ scale: 1.06 }],
  },
  swatchLabel: {
    color: 'rgba(246,246,242,0.62)',
    fontFamily: BrandFonts.primary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  swatchLabelSelected: {
    color: '#F6F6F2',
  },
  continueButton: {
    backgroundColor: '#FA0909',
    paddingVertical: 16,
    paddingHorizontal: 64,
    borderRadius: 12,
  },
  continueButtonText: {
    color: '#F6F6F2',
    fontFamily: BrandFonts.primary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

// ─── ReviewScreen ─────────────────────────────────────────────────────────────

// Returns only the points of each stroke that were drawn at or before `timeSec`
function getStrokesUpToTime(strokes: Stroke[], timeSec: number): Stroke[] {
  return strokes
    .map((s) => ({ ...s, points: s.points.filter((p) => (p.t ?? 0) <= timeSec) }))
    .filter((s) => s.points.length > 0);
}

function ReviewScreen({
  creatorName,
  template,
  flattenedFrameCardRefs,
  capturedFrames,
  reviewData,
  captureSize,
  onRetake,
  onSubmit,
  submitting,
}: {
  creatorName: string;
  template: CardTemplate;
  flattenedFrameCardRefs: { current: (View | null)[] };
  capturedFrames: CapturedFrame[];
  reviewData: { strokes: Stroke[]; strokeColor: string } | null;
  captureSize: { width: number; height: number };
  onRetake: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  // replayFrameIndex: index into capturedFrames during replay, null = not replaying
  const { width: screenW, height: screenH } = useWindowDimensions();
  const reviewCardW = Math.min(screenW, (screenH * 0.72) * (3 / 5));
  const reviewCardH = reviewCardW * (5 / 3);

  const [replayFrameIndex, setReplayFrameIndex] = useState<number | null>(null);
  const replayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startReplay = () => {
    if (replayFrameIndex !== null || !capturedFrames.length) return;

    let idx = 0;
    setReplayFrameIndex(0);
    // Step through frames at ~8fps (120ms each)
    replayIntervalRef.current = setInterval(() => {
      idx += 1;
      if (idx >= capturedFrames.length) {
        clearInterval(replayIntervalRef.current!);
        replayIntervalRef.current = null;
        setReplayFrameIndex(null); // back to static card
      } else {
        setReplayFrameIndex(idx);
      }
    }, 120);
  };

  useEffect(() => {
    return () => {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    };
  }, []);

  const isReplaying = replayFrameIndex !== null;
  const replayFrame = isReplaying ? capturedFrames[replayFrameIndex!] : null;
  // During replay: show strokes up to the current frame's timestamp
  // At rest: show all strokes
  const displayStrokes = reviewData
    ? (replayFrame !== null && replayFrame !== undefined
        ? getStrokesUpToTime(reviewData.strokes, replayFrame.t)
        : reviewData.strokes)
    : [];
  // Photo to show in the top panel: current replay frame or last captured frame
  const photoUri = replayFrame?.uri ?? capturedFrames[capturedFrames.length - 1]?.uri ?? null;

  return (
    <View style={styles.reviewContainer}>
      <Pressable style={[styles.reviewCardWrapper, { width: reviewCardW, height: reviewCardH }]} onPress={startReplay}>
        <AutographCardCanvas
          template={template}
          creatorName={creatorName}
          photoSource={photoUri ? { uri: photoUri } : undefined}
          captureWidth={captureSize.width}
          captureHeight={captureSize.height}
          strokes={displayStrokes}
          strokeColor={reviewData?.strokeColor ?? DEFAULT_TEMPLATE_STROKE}
          style={styles.reviewCardCanvas}
        />
      </Pressable>

      <View style={styles.hiddenFlattenedFramesStage} pointerEvents="none">
        {capturedFrames.map((frame, index) => (
          <View
            key={`${frame.t}-${index}`}
            ref={(value) => {
              flattenedFrameCardRefs.current[index] = value;
            }}
            collapsable={false}
            style={[
              styles.hiddenFlattenedFrame,
              {
                width: FLATTENED_PREVIEW_FRAME_EXPORT_WIDTH,
                aspectRatio: template.aspectRatio.width / template.aspectRatio.height,
              },
            ]}
          >
            <AutographCardCanvas
              template={template}
              creatorName={creatorName}
              nameScale={getFlattenedNameScale(template, creatorName)}
              photoSource={{ uri: frame.uri }}
              captureWidth={captureSize.width}
              captureHeight={captureSize.height}
              strokes={reviewData ? getStrokesUpToTime(reviewData.strokes, frame.t) : []}
              strokeColor={reviewData?.strokeColor ?? DEFAULT_TEMPLATE_STROKE}
              style={styles.reviewCardCanvas}
            />
          </View>
        ))}
      </View>

      <View style={styles.reviewButtons}>
        <Pressable style={[styles.retakeButton, submitting && styles.reviewButtonDisabled]} onPress={onRetake} disabled={submitting}>
          <Text style={styles.retakeButtonText}>Retake</Text>
        </Pressable>
        <Pressable style={[styles.submitButton, submitting && styles.reviewButtonDisabled]} onPress={onSubmit} disabled={submitting}>
          {submitting ? (
            <View style={styles.submitLoadingRow}>
              <ActivityIndicator size="small" color="#111" />
              <Text style={styles.submitButtonText}>Submitting…</Text>
            </View>
          ) : (
            <Text style={styles.submitButtonText}>Submit</Text>
          )}
        </Pressable>
      </View>

      {!isReplaying && (
        <Pressable onPress={startReplay} style={styles.tapHint}>
          <Text style={styles.tapHintText}>▶  Tap to watch signing</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editStyleButton: {
    position: 'absolute',
    top: 16,
    zIndex: 60,
    elevation: 60,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  editStyleButtonText: {
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  captureShell: {
    backgroundColor: 'white',
  },
  captureGestureLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
  startOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    elevation: 40,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: BrandColors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
    marginTop: 12,
  },
  instructions: {
    color: '#2a3136',
    fontFamily: BrandFonts.primary,
    fontSize: 17,
    textAlign: 'center',
    marginTop: 4,
  },
  tapButton: {
    paddingVertical: 12,
    width: '90%',
    alignItems: 'center',
  },
  tapText: {
    fontSize: 96,
    lineHeight: 124,
    fontWeight: '700',
    fontFamily: BrandFonts.script,
    color: BrandColors.primary,
    includeFontPadding: false,
  },
  timerCircle: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  timerText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: 'bold',
  },
  permissionText: {
    fontSize: 18,
    marginBottom: 16,
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  permissionButton: {
    backgroundColor: BrandColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: 'white',
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: BrandColors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  hiddenFlattenedFramesStage: {
    position: 'absolute',
    left: 0,
    top: 0,
    opacity: 0.01,
    zIndex: -1,
    elevation: 0,
  },
  hiddenFlattenedFrame: {
    backgroundColor: '#fff',
  },
  // Review screen
  reviewContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewCardWrapper: {
    overflow: 'hidden',
  },
  reviewCardCanvas: {
    flex: 1,
  },
  reviewButtons: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 16,
  },
  retakeButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
  },
  retakeButtonText: {
    color: '#fff',
    fontFamily: BrandFonts.primary,
    fontSize: 17,
    fontWeight: '600',
  },
  submitButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  reviewButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontSize: 17,
    fontWeight: '600',
  },
  submitLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tapHint: {
    alignItems: 'center',
    marginTop: 16,
  },
  tapHintText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontFamily: BrandFonts.primary,
  },
  birthdayBanner: {
    alignItems: 'center',
    marginTop: 22,
    gap: 12,
  },
  tapToSignText: {
    fontFamily: BrandFonts.primary,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 20,
  },
  birthdayBannerText: {
    color: '#F1C168',
    fontFamily: BrandFonts.primary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.9,
  },
});

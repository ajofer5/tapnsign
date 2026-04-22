import { BrandColors, BrandFonts } from '@/constants/theme';
import { callEdgeFunction } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { ResizeMode, Video } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation, useRouter } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

type Point = {
  x: number;
  y: number;
  t: number;
};

type Stroke = {
  id: string;
  points: Point[];
};

function buildSparkPath(cx: number, cy: number, r: number) {
  const inner = r * 0.3;
  return `M ${cx},${cy - r} L ${cx + inner},${cy - inner} L ${cx + r},${cy} L ${cx + inner},${cy + inner} L ${cx},${cy + r} L ${cx - inner},${cy + inner} L ${cx - r},${cy} L ${cx - inner},${cy - inner} Z`;
}

export default function CaptureScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const GOLD_COLOR = '#C9A84C';
  const RED_COLOR = '#FA0909';

  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [captureSize, setCaptureSize] = useState({ width: 1, height: 1 });
  const [uploading, setUploading] = useState(false);
  const [isGold, setIsGold] = useState(false);
  const [reviewData, setReviewData] = useState<{ uri: string; strokes: Stroke[]; strokeColor: string } | null>(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

  // Refs used by PanResponder and recording callbacks (closures that can't see state updates)
  const startedRef = useRef(false);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef<any>(null);

  const router = useRouter();
  const navigation = useNavigation();
  const { user, profile } = useAuth();

  const isBirthday = (() => {
    if (!profile?.birthday_month || !profile?.birthday_day) return false;
    const now = new Date();
    return now.getMonth() + 1 === profile.birthday_month && now.getDate() === profile.birthday_day;
  })();

  useEffect(() => {
    if (isBirthday) setIsGold(true);
  }, [isBirthday]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: !started && !uploading && !reviewData,
    });

    return () => {
      navigation.setOptions({
        headerShown: true,
      });
    };
  }, [navigation, started, uploading, reviewData]);


  useEffect(() => {
    if (!started) return;
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [started, timeLeft]);

  const getElapsedTimeSeconds = () => {
    if (!recordingStartTimeRef.current) return 0;
    return Number(((Date.now() - recordingStartTimeRef.current) / 1000).toFixed(3));
  };

  const buildSvgPath = (points: Point[]) => {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i].x + points[i + 1].x) / 2;
      const my = (points[i].y + points[i + 1].y) / 2;
      d += ` Q ${points[i].x} ${points[i].y} ${mx} ${my}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;
    return d;
  };

  const resetState = () => {
    // Reset refs first so PanResponder stops accepting touches immediately
    startedRef.current = false;
    strokesRef.current = [];
    currentStrokeRef.current = null;
    recordingStartTimeRef.current = null;
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }

    setStarted(false);
    setTimeLeft(5);
    setStrokes([]);
    setCurrentStroke(null);
    setUploading(false);
    setReviewData(null);
    setThumbnailUri(null);
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

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setCaptureSize({ width, height });
  };

  const handleStart = async () => {
if (!cameraRef.current || startedRef.current) return;

    if (!user) {
      Alert.alert('Not signed in', 'Please sign in before capturing an autograph.');
      return;
    }

    if (profile?.role !== 'verified' || profile?.verification_status !== 'verified') {
      Alert.alert('Verified accounts only', 'Only verified accounts can capture autographs.');
      return;
    }

    try {
      setStarted(true);
      startedRef.current = true;
      setTimeLeft(5);
      setStrokes([]);
      setCurrentStroke(null);
      strokesRef.current = [];
      currentStrokeRef.current = null;
      recordingStartTimeRef.current = Date.now();

      stopTimeoutRef.current = setTimeout(() => {
        finalizeCurrentStroke();
        cameraRef.current?.stopRecording();
      }, 5000);

      const video = await cameraRef.current.recordAsync({ maxDuration: 5 });

      finalizeCurrentStroke();
      const finalizedStrokes = [...strokesRef.current];

      startedRef.current = false;
      setStarted(false);
      setReviewData({ uri: video.uri, strokes: finalizedStrokes, strokeColor: isGold ? GOLD_COLOR : RED_COLOR });
      VideoThumbnails.getThumbnailAsync(video.uri, { time: 1000 })
        .then((thumb) => setThumbnailUri(thumb.uri))
        .catch(() => setThumbnailUri(null));
    } catch {
      Alert.alert('Capture Failed', 'Something went wrong while capturing. Please try again.');
      resetState();
    }
  };

  const handleSubmit = async (pickedThumbnailUri: string | null) => {
    if (!reviewData || !user) return;
    const { uri, strokes: finalizedStrokes, strokeColor } = reviewData;
    setReviewData(null);
    setThumbnailUri(null);
    setUploading(true);

    try {
      const uploadTargets = await callEdgeFunction<{
        video: { path: string; signedUrl: string; token: string };
        thumbnail: { path: string; signedUrl: string; token: string } | null;
      }>('create-capture-upload-targets', {
        include_thumbnail: !!pickedThumbnailUri,
      });

      // Upload video
      const formData = new FormData();
      formData.append('', { uri, name: uploadTargets.video.path.split('/').pop() ?? 'capture.mov', type: 'video/quicktime' } as any);
      const { error: videoUploadError } = await supabase.storage
        .from('autograph-videos')
        .uploadToSignedUrl(
          uploadTargets.video.path,
          uploadTargets.video.token,
          formData
        );
      if (videoUploadError) {
        throw new Error(videoUploadError.message ?? 'Upload failed');
      }

      // Upload thumbnail if one was picked
      if (pickedThumbnailUri && uploadTargets.thumbnail) {
        const thumbForm = new FormData();
        thumbForm.append('', { uri: pickedThumbnailUri, name: uploadTargets.thumbnail.path.split('/').pop() ?? 'capture-thumb.jpg', type: 'image/jpeg' } as any);
        const { error: thumbnailUploadError } = await supabase.storage
          .from('autograph-videos')
          .uploadToSignedUrl(
            uploadTargets.thumbnail.path,
            uploadTargets.thumbnail.token,
            thumbForm
          );
        if (thumbnailUploadError) console.log('Thumbnail upload skipped', thumbnailUploadError.message);
      }

      const insertedAutograph = await callEdgeFunction<{
        autograph: {
          id: string;
          certificate_id: string;
          visibility: 'private' | 'public';
          sale_state: 'not_for_sale' | 'fixed';
          is_for_sale: boolean;
          content_hash: string;
        };
      }>('mint-autograph', {
        video_path: uploadTargets.video.path,
        thumbnail_path: uploadTargets.thumbnail?.path ?? null,
        strokes_json: finalizedStrokes,
        capture_width: captureSize.width,
        capture_height: captureSize.height,
        stroke_color: strokeColor,
      });

      console.log('Autograph mint succeeded', insertedAutograph);

      resetState();
      router.push('/thankyou');
    } catch (error: any) {
      console.log('Capture error:', { message: error?.message, details: error?.details, hint: error?.hint, code: error?.code });
      Alert.alert('Capture Failed', 'Something went wrong while saving your autograph. Please try again.');
      resetState();
    }
  };

  const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

  if (!cameraPermission) {
    return <View style={styles.permissionContainer} />;
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

  if (reviewData) {
    return (
      <ReviewScreen
        uri={reviewData.uri}
        strokes={reviewData.strokes}
        strokeColor={reviewData.strokeColor}
        captureWidth={captureSize.width}
        captureHeight={captureSize.height}
        onRetake={resetState}
        onSubmit={() => handleSubmit(thumbnailUri)}
      />
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

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <CameraView ref={cameraRef} style={styles.camera} facing="front" mode="video" />

      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
        <Svg style={{ flex: 1 }}>
          {allStrokes.map((stroke) => {
            const d = buildSvgPath(stroke.points);
            if (!d) return null;
            if (!isGold) {
              return (
                <Path
                  key={stroke.id}
                  d={d}
                  stroke={RED_COLOR}
                  strokeWidth={5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.9}
                />
              );
            }
            const last = stroke.points[stroke.points.length - 1];
            const lx = last?.x ?? 0;
            const ly = last?.y ?? 0;
            return [
              <Path key={`${stroke.id}-g1`} d={d} stroke="#C9A84C" strokeWidth={16} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.10} />,
              <Path key={`${stroke.id}-g2`} d={d} stroke="#C9A84C" strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.25} />,
              <Path key={`${stroke.id}-g3`} d={d} stroke="#E8C56E" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />,
              <Path key={`${stroke.id}-g4`} d={d} stroke="#FFF0A0" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />,
              <Path key={`${stroke.id}-s1`} d={buildSparkPath(lx, ly, 10)} fill="#FFF0A0" opacity={0.95} />,
              <Path key={`${stroke.id}-s2`} d={buildSparkPath(lx + 12, ly - 8, 5)} fill="#E8C56E" opacity={0.7} />,
            ];
          })}
        </Svg>
      </View>

      {started && (
        <View style={styles.timerCircle}>
          <Text style={styles.timerText}>{timeLeft}</Text>
        </View>
      )}

      {!started && (
        <View style={styles.center}>
          <Pressable style={styles.tapButton} onPress={handleStart}>
            <Text style={[styles.tapText, isGold && { color: GOLD_COLOR }]} adjustsFontSizeToFit numberOfLines={1}>TapnSign </Text>
          </Pressable>
          <Text style={styles.instructions}>
            Tap TapnSign, then sign the screen for 5 seconds
          </Text>
          {isBirthday ? (
            <View style={styles.birthdayBanner}>
              <Text style={styles.birthdayBannerText}>Happy Birthday — your signature is gold today</Text>
              <Pressable style={styles.goldToggle} onPress={() => setIsGold((prev: boolean) => !prev)}>
                <View style={[styles.goldToggleBox, isGold && styles.goldToggleBoxActive]}>
                  {isGold && <Text style={styles.goldToggleTick}>✓</Text>}
                </View>
                <Text style={[styles.goldToggleLabel, isGold && { color: GOLD_COLOR }]}>
                  Gold Signature
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
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
    color: 'white',
    fontFamily: BrandFonts.primary,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  tapButton: {
    paddingVertical: 12,
    width: '90%',
    alignItems: 'center',
  },
  tapText: {
    fontSize: 120,
    lineHeight: 155,
    fontWeight: '700',
    fontFamily: BrandFonts.script,
    color: BrandColors.primary,
    includeFontPadding: false,
  },
  timerCircle: {
    position: 'absolute',
    top: 24,
    left: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(200, 200, 200, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerText: {
    fontSize: 32,
    color: '#111',
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
  reviewContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewVideoWrapper: {
    width: '100%',
    flex: 1,
  },
  reviewButtons: {
    flexDirection: 'row',
    gap: 16,
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
  submitButtonText: {
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontSize: 17,
    fontWeight: '600',
  },
  goldToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    gap: 10,
  },
  goldToggleBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  goldToggleBoxActive: {
    borderColor: '#C9A84C',
    backgroundColor: 'rgba(201,168,76,0.2)',
  },
  goldToggleTick: {
    color: '#C9A84C',
    fontSize: 14,
    fontWeight: '700',
  },
  goldToggleLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: BrandFonts.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  birthdayBanner: {
    alignItems: 'center',
    marginTop: 24,
    gap: 12,
  },
  birthdayBannerText: {
    color: '#C9A84C',
    fontFamily: BrandFonts.primary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.9,
  },
});

function ReviewScreen({
  uri, strokes, strokeColor, captureWidth, captureHeight, onRetake, onSubmit,
}: {
  uri: string;
  strokes: Stroke[];
  strokeColor: string;
  captureWidth: number;
  captureHeight: number;
  onRetake: () => void;
  onSubmit: () => void;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [displaySize, setDisplaySize] = useState({ width: 1, height: 1 });

  return (
    <View style={styles.reviewContainer}>
      <View
        style={styles.reviewVideoWrapper}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setDisplaySize({ width, height });
        }}
      >
        <Video
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          isLooping
          isMuted
          onPlaybackStatusUpdate={(status) => {
            if (status.isLoaded) setCurrentTime(status.positionMillis / 1000);
          }}
        />
        <Svg
          width={displaySize.width}
          height={displaySize.height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          {strokes.map((stroke) => {
            const scaleX = displaySize.width / (captureWidth || 1);
            const scaleY = displaySize.height / (captureHeight || 1);
            const visible = stroke.points.filter((p) => p.t <= currentTime);
            if (!visible.length) return null;
            const scaled = visible.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
            let d = `M ${scaled[0].x} ${scaled[0].y}`;
            for (let i = 1; i < scaled.length - 1; i++) {
              const mx = (scaled[i].x + scaled[i + 1].x) / 2;
              const my = (scaled[i].y + scaled[i + 1].y) / 2;
              d += ` Q ${scaled[i].x} ${scaled[i].y} ${mx} ${my}`;
            }
            if (scaled.length > 1) d += ` L ${scaled[scaled.length - 1].x} ${scaled[scaled.length - 1].y}`;
            const isGoldStroke = strokeColor === '#C9A84C';
            if (!isGoldStroke) {
              return (
                <Path
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
            const first = visible[0];
            const last = visible[visible.length - 1];
            const fx = first.x * scaleX;
            const fy = first.y * scaleY;
            const lx = last.x * scaleX;
            const ly = last.y * scaleY;
            return [
              <Path key={`${stroke.id}-g1`} d={d} stroke="#C9A84C" strokeWidth={16} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.10} />,
              <Path key={`${stroke.id}-g2`} d={d} stroke="#C9A84C" strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.25} />,
              <Path key={`${stroke.id}-g3`} d={d} stroke="#E8C56E" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />,
              <Path key={`${stroke.id}-g4`} d={d} stroke="#FFF0A0" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />,
              <Path key={`${stroke.id}-s1`} d={buildSparkPath(fx, fy, 8)} fill="#FFF0A0" opacity={0.9} />,
              <Path key={`${stroke.id}-s2`} d={buildSparkPath(lx, ly, 10)} fill="#FFF0A0" opacity={0.95} />,
              <Path key={`${stroke.id}-s3`} d={buildSparkPath(lx + 12, ly - 8, 5)} fill="#E8C56E" opacity={0.7} />,
            ];
          })}
        </Svg>
      </View>
      <View style={styles.reviewButtons}>
        <Pressable style={styles.retakeButton} onPress={onRetake}>
          <Text style={styles.retakeButtonText}>Retake</Text>
        </Pressable>
        <Pressable style={styles.submitButton} onPress={onSubmit}>
          <Text style={styles.submitButtonText}>Submit</Text>
        </Pressable>
      </View>
    </View>
  );
}

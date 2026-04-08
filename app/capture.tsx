import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as MediaLibrary from 'expo-media-library';
import { useNavigation, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { BrandColors, BrandFonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
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

export default function CaptureScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [captureSize, setCaptureSize] = useState({ width: 1, height: 1 });
  const [orientationReady, setOrientationReady] = useState(false);
  const [uploading, setUploading] = useState(false);

  const startedRef = useRef(false);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef<any>(null);

  const router = useRouter();
  const navigation = useNavigation();
  const { user, profile } = useAuth();

  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: !started && !uploading,
    });

    return () => {
      navigation.setOptions({
        headerShown: true,
      });
    };
  }, [navigation, started, uploading]);

  useEffect(() => {
    let isMounted = true;

    const lockOrientation = async () => {
      try {
        setOrientationReady(false);
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
        );
        if (isMounted) setOrientationReady(true);
      } catch (error) {
        console.log('Orientation lock error:', error);
        if (isMounted) setOrientationReady(true);
      }
    };

    lockOrientation();

    return () => {
      isMounted = false;
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

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
    return points
      .map((point, index) =>
        index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
      )
      .join(' ');
  };

  const resetState = () => {
    setStarted(false);
    setTimeLeft(5);
    setStrokes([]);
    setCurrentStroke(null);
    setUploading(false);

    startedRef.current = false;
    strokesRef.current = [];
    currentStrokeRef.current = null;
    recordingStartTimeRef.current = null;

    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
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
    if (!orientationReady) {
      Alert.alert('Please wait', 'Screen orientation is still being prepared.');
      return;
    }
    if (!cameraRef.current || startedRef.current) return;

    if (!user) {
      Alert.alert('Not signed in', 'Please sign in before capturing an autograph.');
      return;
    }

    if (profile?.role !== 'verified') {
      Alert.alert('Verified accounts only', 'Only verified accounts can capture autographs.');
      return;
    }

    if (!mediaPermission?.granted) {
      const permissionResponse = await requestMediaPermission();
      if (!permissionResponse.granted) {
        Alert.alert('Permission required', 'Photo library permission is required to save videos.');
        return;
      }
    }

    try {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
      );

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

      setStarted(false);
      startedRef.current = false;
      setUploading(true);

      // Save to device media library
      const asset = await MediaLibrary.createAssetAsync(video.uri);
      const album = await MediaLibrary.getAlbumAsync('My Autographs');
      if (album) {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album.id, false);
      } else {
        await MediaLibrary.createAlbumAsync('My Autographs', asset, false);
      }

      // Upload video to Supabase Storage via FormData (required for file:// URIs in React Native)
      const fileName = `${user!.id}/${Date.now()}.mov`;
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append('', {
        uri: video.uri,
        name: fileName,
        type: 'video/quicktime',
      } as any);

      const uploadResponse = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/autograph-videos/${fileName}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'x-upsert': 'false',
          },
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        const err = await uploadResponse.json();
        throw new Error(err.message ?? 'Upload failed');
      }

      const { data: { publicUrl } } = supabase.storage
        .from('autograph-videos')
        .getPublicUrl(fileName);

      // Generate content hash from metadata (not full video bytes)
      const contentHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        publicUrl + JSON.stringify(finalizedStrokes) + user!.id
      );

      // Insert autograph record
      const autographInsertPayload = {
        celebrity_id: user!.id,
        owner_id: user!.id,
        video_url: publicUrl,
        strokes_json: finalizedStrokes,
        capture_width: captureSize.width,
        capture_height: captureSize.height,
        content_hash: contentHash,
      };

      const { error: insertError } = await supabase
        .from('autographs')
        .insert(autographInsertPayload, { defaultToNull: true });

      if (insertError) {
        console.log('Autograph insert failed', {
          message: insertError.message,
          details: (insertError as any).details ?? null,
          hint: (insertError as any).hint ?? null,
          code: (insertError as any).code ?? null,
          payload: autographInsertPayload,
        });
        throw insertError;
      }

      // Keep local AsyncStorage record for offline viewing
      const newItem = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        videoUri: publicUrl,
        strokes: finalizedStrokes,
        captureWidth: captureSize.width,
        captureHeight: captureSize.height,
        lockedOrientation: 'LANDSCAPE_RIGHT',
        videoRotationCorrection: 0,
      };

      const existing = await AsyncStorage.getItem('autographs');
      const parsed = existing ? JSON.parse(existing) : [];
      parsed.unshift(newItem);
      await AsyncStorage.setItem('autographs', JSON.stringify(parsed));

      resetState();
      router.push('/thankyou');
    } catch (error: any) {
      const message = error?.message ?? error?.error_description ?? JSON.stringify(error);
      console.log('Capture error:', {
        message,
        details: error?.details ?? null,
        hint: error?.hint ?? null,
        code: error?.code ?? null,
      });
      Alert.alert('Capture Failed', message);
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

  if (!orientationReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BrandColors.primary} />
        <Text style={styles.loadingText}>Preparing camera…</Text>
      </View>
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
            return (
              <Path
                key={stroke.id}
                d={d}
                stroke="#FA0909"
                strokeWidth={5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
              />
            );
          })}
        </Svg>
      </View>

      {started && <Text style={styles.timer}>{timeLeft}</Text>}

      {!started && (
        <View style={styles.center}>
          <Text style={styles.instructions}>
            Tap TapnSign, then sign the screen for 5 seconds
          </Text>
          <Pressable style={styles.tapButton} onPress={handleStart}>
            <Text style={styles.tapText}>TapnSign</Text>
          </Pressable>
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
    paddingHorizontal: 24,
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
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  tapText: {
    fontSize: 56,
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontWeight: 'bold',
  },
  timer: {
    position: 'absolute',
    top: 40,
    right: 24,
    fontSize: 48,
    color: 'white',
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
});

import { AutographCardCanvas } from '@/components/autograph-card-canvas';
import { BrandFonts } from '@/constants/theme';
import { BAKED_PREVIEW_FRAME_COUNT, getPreviewFramePlaybackDelayMs, getPreviewFrameTimeSeconds, PREVIEW_PLAYBACK_END_HOLD_MS } from '@/lib/capture-timing';
import { getCardTemplate } from '@/lib/card-templates';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

type Point = { x: number; y: number; t: number };
type Stroke = { id: string; points: Point[] };

const DEFAULT_INK = '#001B5C';

function buildSmoothPath(points: Point[]) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${mx} ${my}`;
  }
  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  return d;
}

function renderRedStroke(strokeId: string, points: Point[], strokeColor: string) {
  const fullPath = buildSmoothPath(points);
  if (!fullPath) return null;
  return (
    <Path
      key={`${strokeId}-plain`}
      d={fullPath}
      stroke={strokeColor || DEFAULT_INK}
      strokeWidth={5}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function SignatureOverlay({
  strokes,
  currentTimeSeconds,
  sourceWidth,
  sourceHeight,
  displayWidth,
  displayHeight,
  strokeColor,
}: {
  strokes: Stroke[];
  currentTimeSeconds: number;
  sourceWidth: number;
  sourceHeight: number;
  displayWidth: number;
  displayHeight: number;
  strokeColor: string;
}) {
  const isGold = strokeColor === '#F1C168';

  return (
    <Svg
      width={displayWidth}
      height={displayHeight}
      viewBox={`0 0 ${sourceWidth || 1} ${sourceHeight || 1}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      {strokes.map((stroke) => {
        const visible = stroke.points.filter((p) => p.t <= currentTimeSeconds);
        if (!visible.length) return null;

        if (!isGold) {
          return renderRedStroke(stroke.id, visible, strokeColor);
        }

        const d = buildSmoothPath(visible);

        return [
          <Path key={`${stroke.id}-g1`} d={d} stroke="#D9AF4C" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />,
          <Path key={`${stroke.id}-g2`} d={d} stroke="#FFF0A0" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.82} />,
        ];
      })}
    </Svg>
  );
}

type AutographPlayerProps = {
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  previewFrameUrls?: string[] | null;
  previewFrameTimesMs?: number[] | null;
  creatorName?: string | null;
  templateId?: string | null;
  strokes: Stroke[];
  strokeColor: string;
  captureWidth: number;
  captureHeight: number;
  hintText?: string;
  onLongPress?: () => void;
  overlayContent?: ReactNode;
};

export function AutographPlayer({
  videoUrl,
  thumbnailUrl,
  previewFrameUrls,
  previewFrameTimesMs,
  creatorName,
  templateId,
  strokes,
  strokeColor,
  captureWidth,
  captureHeight,
  hintText = 'Tap and hold for video options',
  onLongPress,
  overlayContent,
}: AutographPlayerProps) {
  const template = getCardTemplate(templateId);
  const [box, setBox] = useState({ width: 1, height: 1 });
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparingFrames, setIsPreparingFrames] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const videoRef = useRef<Video | null>(null);
  const flipbookRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloadPromiseRef = useRef<Promise<void> | null>(null);
  const isRotated = rotation === 90 || rotation === -90;
  const hasFlipbook = !videoUrl && !!previewFrameUrls?.length;
  const hasBakedPreviewFrames = (previewFrameUrls?.length ?? 0) > 0 && (previewFrameUrls?.length ?? 0) <= BAKED_PREVIEW_FRAME_COUNT;
  const staticFrame = thumbnailUrl ?? (previewFrameUrls?.length ? previewFrameUrls[previewFrameUrls.length - 1] : null);
  const flipbookCardFrameUri = previewFrameUrls?.length
    ? (frameIndex != null ? (previewFrameUrls[frameIndex] ?? previewFrameUrls[previewFrameUrls.length - 1]) : previewFrameUrls[previewFrameUrls.length - 1])
    : null;
  const activeFrameUri = frameIndex != null && previewFrameUrls?.length
    ? (previewFrameUrls[frameIndex] ?? staticFrame)
    : staticFrame;
  const sourceAspect = Math.max(captureWidth || 1, 1) / Math.max(captureHeight || 1, 1);
  const wrapperAspect = box.width / Math.max(box.height, 1);
  const mediaWidth = wrapperAspect > sourceAspect ? box.height * sourceAspect : box.width;
  const mediaHeight = wrapperAspect > sourceAspect ? box.height : box.width / sourceAspect;
  const mediaLeft = (box.width - mediaWidth) / 2;
  const mediaTop = (box.height - mediaHeight) / 2;
  const currentTimeSeconds = hasFlipbook && previewFrameUrls?.length && frameIndex != null && previewFrameUrls.length > 1
    ? getPreviewFrameTimeSeconds(frameIndex, previewFrameUrls.length, previewFrameTimesMs)
    : Infinity;

  const handleStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPlaybackTime(status.positionMillis / 1000);
    setIsPlaying(status.isPlaying);
  };

  const ensurePreviewFramesReady = async () => {
    if (!previewFrameUrls?.length) return;
    if (preloadPromiseRef.current) return preloadPromiseRef.current;

    const criticalUrls = [
      previewFrameUrls[0],
      previewFrameUrls[1],
      previewFrameUrls[2],
      previewFrameUrls[previewFrameUrls.length - 1],
      thumbnailUrl,
    ].filter((url, index, array): url is string => !!url && array.indexOf(url) === index);

    const promise = Promise.allSettled(
      criticalUrls.map(async (url) => {
        try {
          await Image.prefetch(url);
        } catch {}
      })
    ).then(() => undefined);

    preloadPromiseRef.current = promise;
    await promise;
  };

  const togglePlay = async () => {
    if (videoUrl) {
      if (!videoRef.current) return;
      const status = await videoRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
      return;
    }

    if (hasFlipbook && previewFrameUrls?.length) {
      if (flipbookRef.current || isPreparingFrames) return;
      setIsPreparingFrames(true);
      try {
        await ensurePreviewFramesReady();
      } finally {
        setIsPreparingFrames(false);
      }

      setIsPlaying(true);
      setFrameIndex(0);
      const runFrame = (idx: number) => {
        if (!previewFrameUrls?.length) return;
        setFrameIndex(idx);
        if (idx >= previewFrameUrls.length - 1) {
          flipbookRef.current = setTimeout(() => {
            flipbookRef.current = null;
            setFrameIndex(null);
            setIsPlaying(false);
          }, PREVIEW_PLAYBACK_END_HOLD_MS);
          return;
        }

        const delayMs = getPreviewFramePlaybackDelayMs(idx, previewFrameUrls.length, previewFrameTimesMs);
        flipbookRef.current = setTimeout(() => runFrame(idx + 1), delayMs);
      };

      runFrame(0);
    }
  };

  useEffect(() => {
    if (previewFrameUrls?.length) {
      previewFrameUrls.forEach((url) => {
        if (url) void Image.prefetch(url);
      });
    }
    if (thumbnailUrl) void Image.prefetch(thumbnailUrl);
  }, [previewFrameUrls, thumbnailUrl]);

  useEffect(() => {
    return () => {
      if (flipbookRef.current) clearTimeout(flipbookRef.current);
    };
  }, []);

  return (
    <View
      style={styles.videoWrapper}
      onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <View style={styles.videoLayer}>
        {videoUrl ? (
          <Video
            ref={videoRef}
            source={{ uri: videoUrl }}
            style={[
              styles.video,
              isRotated && { width: box.height, height: box.width },
              rotation !== 0 && { transform: [{ rotate: `${rotation}deg` }] },
            ]}
            useNativeControls={false}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
            onReadyForDisplay={({ naturalSize }) => {
              const captureIsPortrait = captureWidth < captureHeight;
              const videoIsLandscape = naturalSize.width > naturalSize.height;
              setRotation(captureIsPortrait && videoIsLandscape ? 90 : 0);
            }}
            onPlaybackStatusUpdate={handleStatus}
          />
        ) : hasFlipbook && activeFrameUri ? (
          hasBakedPreviewFrames ? (
            <Image source={{ uri: activeFrameUri }} style={styles.video} resizeMode="contain" />
          ) : (
            <AutographCardCanvas
              template={template}
              creatorName={creatorName ?? ''}
              captureWidth={captureWidth}
              captureHeight={captureHeight}
              strokes={strokes}
              currentTimeSeconds={frameIndex != null ? currentTimeSeconds : undefined}
              strokeColor={strokeColor}
              photoSource={flipbookCardFrameUri ? { uri: flipbookCardFrameUri } : undefined}
              style={styles.cardCanvas}
            />
          )
        ) : activeFrameUri ? (
          <Image source={{ uri: activeFrameUri }} style={styles.video} resizeMode="contain" />
        ) : null}
      </View>

      {videoUrl && (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <SignatureOverlay
            strokes={strokes}
            currentTimeSeconds={videoUrl ? playbackTime : currentTimeSeconds}
            sourceWidth={captureWidth}
            sourceHeight={captureHeight}
            displayWidth={box.width}
            displayHeight={box.height}
            strokeColor={strokeColor}
          />
        </View>
      )}

      {overlayContent ? (
        <View
          pointerEvents="none"
          style={[
            styles.statsOverlay,
            {
              left: mediaLeft,
              top: mediaTop,
              width: mediaWidth,
              height: mediaHeight,
            },
          ]}
        >
          {overlayContent}
        </View>
      ) : null}

      <Text style={styles.videoHintText}>{videoUrl ? hintText : 'Tap to replay signing'}</Text>

      <Pressable
        style={styles.videoTapTarget}
        onPress={togglePlay}
        onLongPress={onLongPress}
        delayLongPress={400}
        {...(Platform.OS === 'web' && onLongPress
          ? { onContextMenu: (e: any) => { e.preventDefault(); onLongPress(); } }
          : Platform.OS === 'web'
            ? { onContextMenu: (e: any) => e.preventDefault() }
            : {})}
      >
        {isPreparingFrames ? (
          <View style={styles.playButtonCircle}>
            <Text style={styles.preparingText}>...</Text>
          </View>
        ) : !isPlaying && (
          <View style={styles.playButtonCircle}>
            <View style={styles.playTriangle} />
          </View>
        )}
      </Pressable>

    </View>
  );
}

const styles = StyleSheet.create({
  videoWrapper: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  videoLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  cardCanvas: {
    width: '100%',
    height: '100%',
  },
  videoHintText: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontFamily: BrandFonts.primary,
    pointerEvents: 'none',
  },
  videoTapTarget: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsOverlay: {
    zIndex: 10,
    elevation: 10,
  },
  playButtonCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 14,
    borderBottomWidth: 14,
    borderLeftWidth: 24,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#fff',
    marginLeft: 6,
  },
  preparingText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
    letterSpacing: 2,
    marginLeft: 2,
    marginTop: -2,
  },
});

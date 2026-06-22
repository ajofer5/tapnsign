import { publicVideoCardStyles } from '@/components/public-video-card';
import { BAKED_PREVIEW_FRAME_COUNT, getPreviewFramePlaybackDelayMs, getPreviewFrameTimeSeconds, PREVIEW_PLAYBACK_END_HOLD_MS } from '@/lib/capture-timing';
import { ResizeMode, Video } from 'expo-av';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
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
      style={styles.thumbnailOverlay}
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

type PublicVideoThumbnailProps = {
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  previewFrameUrls?: string[] | null;
  previewFrameTimesMs?: number[] | null;
  strokes: Stroke[];
  captureWidth: number;
  captureHeight: number;
  strokeColor: string;
  shellStyle?: StyleProp<ViewStyle>;
  /**
   * 'static'        — show the thumbnail image only (default, used in marketplace/my autographs)
   * 'flipbook-once' — animate through preview frames once, freeze on thumbnail (used in profile grid)
   * 'flipbook-loop' — loop continuously (legacy behavior)
   */
  mode?: 'static' | 'flipbook-once' | 'flipbook-loop';
  overlayContent?: ReactNode;
  showPlayOverlay?: boolean;
  playOverlayTiming?: 'always' | 'after-playback';
  mediaBackgroundColor?: string;
};

export function PublicVideoThumbnail({
  videoUrl,
  thumbnailUrl,
  previewFrameUrls,
  previewFrameTimesMs,
  strokes,
  captureWidth,
  captureHeight,
  strokeColor,
  shellStyle,
  mode = 'static',
  overlayContent,
  showPlayOverlay = false,
  playOverlayTiming = 'always',
  mediaBackgroundColor = '#050505',
}: PublicVideoThumbnailProps) {
  const [box, setBox] = useState({ width: 1, height: 1 });
  const [rotation, setRotation] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [flipbookDone, setFlipbookDone] = useState(false);
  const [framesReady, setFramesReady] = useState(mode === 'static');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloadPromiseRef = useRef<Promise<void> | null>(null);

  const isRotated = rotation === 90 || rotation === -90;
  const hasPreviewFrames = !!previewFrameUrls?.length;
  const previewFramesAreBaked = (previewFrameUrls?.length ?? 0) > 0 && (previewFrameUrls?.length ?? 0) <= BAKED_PREVIEW_FRAME_COUNT;
  // The static image to show: thumbnail_url preferred, otherwise last preview frame, otherwise first
  const staticImage = thumbnailUrl ?? (hasPreviewFrames ? previewFrameUrls![previewFrameUrls!.length - 1] : null);

  const ensurePreviewFramesReady = useCallback(async () => {
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
  }, [previewFrameUrls, thumbnailUrl]);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setFrameIndex(0);
    setFlipbookDone(false);
    setFramesReady(mode === 'static');

    if (mode === 'static' || !hasPreviewFrames || !previewFrameUrls?.length) return;

    const frames = previewFrameUrls;
    let alive = true;

    const runFrame = (index: number) => {
      if (!alive) return;
      setFrameIndex(index);
      const next = index + 1;
      if (next >= frames.length) {
        if (mode === 'flipbook-once') {
          setFlipbookDone(true);
          timeoutRef.current = null;
          return;
        }
        timeoutRef.current = setTimeout(() => runFrame(0), PREVIEW_PLAYBACK_END_HOLD_MS);
        return;
      }

      const delayMs = getPreviewFramePlaybackDelayMs(index, frames.length, previewFrameTimesMs);
      timeoutRef.current = setTimeout(() => runFrame(next), delayMs);
    };

    void ensurePreviewFramesReady().finally(() => {
      if (!alive) return;
      setFramesReady(true);
      runFrame(0);
    });

    return () => {
      alive = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [mode, hasPreviewFrames, previewFrameUrls, previewFrameTimesMs, ensurePreviewFramesReady]);

  // Which image to display
  const activeFrame = (() => {
    if (mode === 'static' || flipbookDone || !hasPreviewFrames || !framesReady) return staticImage;
    return previewFrameUrls![frameIndex] ?? staticImage;
  })();

  // Stroke time: used for legacy autographs with strokes overlay
  const currentTimeSeconds = (mode !== 'static' && hasPreviewFrames && previewFrameUrls && previewFrameUrls.length > 1 && !flipbookDone && framesReady)
    ? getPreviewFrameTimeSeconds(frameIndex, previewFrameUrls.length, previewFrameTimesMs)
    : Infinity;
  const shouldShowPlayOverlay = showPlayOverlay && (
    playOverlayTiming === 'always' ||
    flipbookDone ||
    !hasPreviewFrames ||
    mode === 'static'
  );

  return (
    <View
      style={shellStyle ? [publicVideoCardStyles.thumbnailShell, styles.shellReset, shellStyle] : publicVideoCardStyles.thumbnailShell}
      onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <View style={[styles.thumbnailMedia, { backgroundColor: mediaBackgroundColor }]}>
        {activeFrame ? (
          <Image
            source={{ uri: activeFrame }}
            style={[styles.thumbnailVideo, { backgroundColor: mediaBackgroundColor }]}
            resizeMode="contain"
          />
        ) : videoUrl ? (
          <Video
            source={{ uri: videoUrl }}
            style={[
              styles.thumbnailVideo,
              { backgroundColor: mediaBackgroundColor },
              isRotated && { width: box.height, height: box.width },
              rotation !== 0 && { transform: [{ rotate: `${rotation}deg` }] },
            ]}
            useNativeControls={false}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
            isMuted
            onReadyForDisplay={({ naturalSize }) => {
              const captureIsPortrait = captureWidth < captureHeight;
              const videoIsLandscape = naturalSize.width > naturalSize.height;
              setRotation(captureIsPortrait && videoIsLandscape ? 90 : 0);
            }}
          />
        ) : null}
      </View>
      {/* Stroke overlay — only needed for legacy autographs (new autographs have strokes baked into frames) */}
      {strokes.length > 0 && mode !== 'static' && !previewFramesAreBaked && (
        <View pointerEvents="none" style={styles.thumbnailOverlay}>
          <SignatureOverlay
            strokes={strokes}
            currentTimeSeconds={currentTimeSeconds}
            sourceWidth={captureWidth}
            sourceHeight={captureHeight}
            displayWidth={box.width}
            displayHeight={box.height}
            strokeColor={strokeColor}
          />
        </View>
      )}
      {overlayContent ? (
        <View pointerEvents="none" style={styles.thumbnailOverlay}>
          {overlayContent}
        </View>
      ) : null}
      {shouldShowPlayOverlay ? (
        <View pointerEvents="none" style={[styles.thumbnailOverlay, styles.playOverlayCenter]}>
          <View style={styles.playOverlayCircle}>
            <View style={styles.playOverlayTriangle} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shellReset: {
    width: undefined,
    height: undefined,
  },
  thumbnailMedia: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#050505',
  },
  thumbnailVideo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#050505',
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    elevation: 10,
  },
  playOverlayCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlayCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 27, 92, 0.33)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.33)',
  },
  playOverlayTriangle: {
    marginLeft: 3,
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'rgba(255,255,255,0.72)',
  },
});

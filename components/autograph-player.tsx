import { BrandColors, BrandFonts } from '@/constants/theme';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

type Point = { x: number; y: number; t: number };
type Stroke = { id: string; points: Point[] };

function buildSparkPath(cx: number, cy: number, r: number) {
  const inner = r * 0.3;
  return `M ${cx},${cy - r} L ${cx + inner},${cy - inner} L ${cx + r},${cy} L ${cx + inner},${cy + inner} L ${cx},${cy + r} L ${cx - inner},${cy + inner} L ${cx - r},${cy} L ${cx - inner},${cy - inner} Z`;
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
  const isGold = strokeColor === '#C9A84C';

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
        const d = visible.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

        if (!isGold) {
          return (
            <Path
              key={stroke.id}
              d={d}
              stroke={strokeColor}
              strokeWidth={5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }

        const first = visible[0];
        const last = visible[visible.length - 1];

        return [
          <Path key={`${stroke.id}-g1`} d={d} stroke="#C9A84C" strokeWidth={16} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.10} />,
          <Path key={`${stroke.id}-g2`} d={d} stroke="#C9A84C" strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.25} />,
          <Path key={`${stroke.id}-g3`} d={d} stroke="#E8C56E" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />,
          <Path key={`${stroke.id}-g4`} d={d} stroke="#FFF0A0" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />,
          <Path key={`${stroke.id}-s1`} d={buildSparkPath(first.x, first.y, 8)} fill="#FFF0A0" opacity={0.9} />,
          <Path key={`${stroke.id}-s2`} d={buildSparkPath(last.x, last.y, 10)} fill="#FFF0A0" opacity={0.95} />,
          <Path key={`${stroke.id}-s3`} d={buildSparkPath(last.x + 12, last.y - 8, 5)} fill="#E8C56E" opacity={0.7} />,
        ];
      })}
    </Svg>
  );
}

type AutographPlayerProps = {
  videoUrl: string;
  strokes: Stroke[];
  strokeColor: string;
  captureWidth: number;
  captureHeight: number;
  hintText?: string;
  onCertificate?: () => void;
  onLongPress?: () => void;
};

export function AutographPlayer({
  videoUrl,
  strokes,
  strokeColor,
  captureWidth,
  captureHeight,
  hintText = 'Tap and hold for video options',
  onCertificate,
  onLongPress,
}: AutographPlayerProps) {
  const [box, setBox] = useState({ width: 1, height: 1 });
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rotation, setRotation] = useState(0);
  const videoRef = useRef<Video | null>(null);
  const isRotated = rotation === 90 || rotation === -90;

  const handleStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPlaybackTime(status.positionMillis / 1000);
    setIsPlaying(status.isPlaying);
  };

  const togglePlay = async () => {
    if (!videoRef.current) return;
    const status = await videoRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  return (
    <View
      style={styles.videoWrapper}
      onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <View style={styles.videoLayer}>
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
      </View>

      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <SignatureOverlay
          strokes={strokes}
          currentTimeSeconds={playbackTime}
          sourceWidth={captureWidth}
          sourceHeight={captureHeight}
          displayWidth={box.width}
          displayHeight={box.height}
          strokeColor={strokeColor}
        />
      </View>

      <Text style={styles.videoHintText}>{hintText}</Text>

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
        {!isPlaying && (
          <View style={styles.playButtonCircle}>
            <View style={styles.playTriangle} />
          </View>
        )}
      </Pressable>

      {onCertificate && (
        <Pressable style={styles.certOverlayButton} onPress={onCertificate}>
          <Text style={styles.certOverlayButtonText}>TapnSign</Text>
        </Pressable>
      )}
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
  certOverlayButton: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    backgroundColor: 'transparent',
    borderRadius: 10,
    paddingLeft: 16,
    paddingRight: 24,
    paddingVertical: 8,
  },
  certOverlayButtonText: {
    fontFamily: BrandFonts.script,
    color: BrandColors.primary,
    fontSize: 30,
    lineHeight: 36,
  },
});

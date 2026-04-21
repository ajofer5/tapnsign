import { publicVideoCardStyles } from '@/components/public-video-card';
import { ResizeMode, Video } from 'expo-av';
import { useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
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
      style={styles.thumbnailOverlay}
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

type PublicVideoThumbnailProps = {
  videoUrl: string;
  strokes: Stroke[];
  captureWidth: number;
  captureHeight: number;
  strokeColor: string;
  shellStyle?: StyleProp<ViewStyle>;
};

export function PublicVideoThumbnail({
  videoUrl,
  strokes,
  captureWidth,
  captureHeight,
  strokeColor,
  shellStyle,
}: PublicVideoThumbnailProps) {
  const [box, setBox] = useState({ width: 1, height: 1 });
  const [rotation, setRotation] = useState(0);
  const isRotated = rotation === 90 || rotation === -90;

  return (
    <View
      style={[publicVideoCardStyles.thumbnailShell, shellStyle]}
      onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <View style={styles.thumbnailMedia}>
        <Video
          source={{ uri: videoUrl }}
          style={[
            styles.thumbnailVideo,
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
      </View>
      <View pointerEvents="none" style={styles.thumbnailOverlay}>
        <SignatureOverlay
          strokes={strokes}
          currentTimeSeconds={Infinity}
          sourceWidth={captureWidth}
          sourceHeight={captureHeight}
          displayWidth={box.width}
          displayHeight={box.height}
          strokeColor={strokeColor}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
});

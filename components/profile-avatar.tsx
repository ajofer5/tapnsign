import { BrandColors, BrandFonts } from '@/constants/theme';
import { PublicVideoThumbnail } from '@/components/public-video-thumbnail';
import { Image, StyleSheet, Text, View } from 'react-native';

type Point = { x: number; y: number; t: number };
type Stroke = { id: string; points: Point[] };

type ProfileAvatarProps = {
  name: string;
  uri?: string | null;
  videoUrl?: string | null;
  strokes?: Stroke[];
  captureWidth?: number;
  captureHeight?: number;
  strokeColor?: string | null;
  size?: number;
};

export function ProfileAvatar({
  name,
  uri,
  videoUrl,
  strokes = [],
  captureWidth = 1,
  captureHeight = 1,
  strokeColor,
  size = 72,
}: ProfileAvatarProps) {
  const borderRadius = size / 2;
  const initial = (name?.trim().charAt(0) || '?').toUpperCase();

  if (videoUrl) {
    return (
      <View style={[styles.videoShell, { width: size, height: size, borderRadius }]}>
        <PublicVideoThumbnail
          videoUrl={videoUrl}
          strokes={strokes}
          captureWidth={captureWidth}
          captureHeight={captureHeight}
          strokeColor={strokeColor ?? '#FA0909'}
          shellStyle={{ width: size, height: size, borderRadius }}
        />
      </View>
    );
  }

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, { width: size, height: size, borderRadius }]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius }]}>
      <Text style={[styles.initial, { fontSize: Math.round(size * 0.44) }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  videoShell: {
    overflow: 'hidden',
    backgroundColor: '#050505',
  },
  image: {
    backgroundColor: '#ddd',
  },
  fallback: {
    backgroundColor: BrandColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    fontWeight: '700',
    color: '#fff',
    fontFamily: BrandFonts.primary,
  },
});

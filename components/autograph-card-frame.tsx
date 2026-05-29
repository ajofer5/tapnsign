import { Image, StyleSheet, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';

const N = '#000000';

function star4(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

function octPath(x: number, y: number, w: number, h: number, c: number): string {
  return [
    `M ${x + c},${y}`,
    `L ${x + w - c},${y}`,
    `L ${x + w},${y + c}`,
    `L ${x + w},${y + h - c}`,
    `L ${x + w - c},${y + h}`,
    `L ${x + c},${y + h}`,
    `L ${x},${y + h - c}`,
    `L ${x},${y + c}`,
    'Z',
  ].join(' ');
}

export function DisplayCardFrame({ frameId = 'classic' }: { frameId?: 'blur' | 'classic' | 'ophina' | 'ophinia_o' }) {
  if (frameId === 'blur') {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 15, elevation: 15 }]} pointerEvents="none">
        <Image
          source={require('../assets/images/blur-card-frame.@3xpng.png')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </View>
    );
  }

  if (frameId === 'ophinia_o') {
    // Asset was designed for 60:85; new canonical ratio is 60:100 (3:5).
    // Use "contain" to avoid distortion — a new 3:5 asset should replace this.
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 15, elevation: 15 }]} pointerEvents="none">
        <Image
          source={require('../assets/images/ophinia-o-frame@3x.png')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </View>
    );
  }

  if (frameId === 'ophina') {
    // viewBox updated from 300×425 → 300×500. All Y coords scaled by 500/425.
    return (
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 300 500"
        preserveAspectRatio="none"
        style={[StyleSheet.absoluteFill, { zIndex: 15, elevation: 15 }]}
        pointerEvents="none"
      >
        <Path
          d="M 24,7 H 276 A 22,22 0 0 1 298,33 V 344 A 22,22 0 0 1 276,370 H 24 A 22,22 0 0 1 2,344 V 33 A 22,22 0 0 1 24,7 Z M 60,47 H 240 A 16,16 0 0 1 256,66 V 287 A 16,16 0 0 1 240,306 H 60 A 16,16 0 0 1 44,287 V 66 A 16,16 0 0 1 60,47 Z"
          fill={N}
          fillRule="evenodd"
        />
        <Line x1="26" y1="488" x2="274" y2="488" stroke={N} strokeWidth="0.9" opacity="0.18" />
      </Svg>
    );
  }

  // Classic — viewBox updated from 300×425 → 300×500. All Y coords scaled by 500/425.
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 300 500"
      preserveAspectRatio="none"
      style={[StyleSheet.absoluteFill, { zIndex: 15, elevation: 15 }]}
      pointerEvents="none"
    >
      <Path
        d="M 0,0 L 300,0 L 300,500 L 0,500 Z M 29,40 L 271,40 L 282,53 L 282,290 L 271,302 L 29,302 L 18,290 L 18,53 Z M 27,305 L 273,305 L 284,318 L 284,457 L 273,470 L 27,470 L 16,457 L 16,318 Z"
        fill="white"
        fillRule="evenodd"
        stroke="none"
      />

      <Path d="M 5,40 L 5,5 L 34,5" fill="none" stroke={N} strokeWidth="3.5" />
      <Path d="M 266,5 L 295,5 L 295,40" fill="none" stroke={N} strokeWidth="3.5" />
      <Path d="M 5,460 L 5,495 L 34,495" fill="none" stroke={N} strokeWidth="3.5" />
      <Path d="M 266,495 L 295,495 L 295,460" fill="none" stroke={N} strokeWidth="3.5" />

      <Path d={octPath(14, 35, 272, 268, 13)} fill="none" stroke={N} strokeWidth="1.8" />
      <Path d={octPath(18, 40, 264, 259, 11)} fill="none" stroke={N} strokeWidth="0.8" />

      <Path d={octPath(14, 316, 272, 165, 13)} fill="none" stroke={N} strokeWidth="1.8" />
      <Path d={octPath(18, 321, 264, 155, 11)} fill="none" stroke={N} strokeWidth="0.8" />

      <Line x1="40" y1="463" x2="260" y2="463" stroke={N} strokeWidth="0.6" opacity="0.2" />
    </Svg>
  );
}

export function PrintCardFrame() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 300 500"
      preserveAspectRatio="none"
      style={[StyleSheet.absoluteFill, { zIndex: 15, elevation: 15 }]}
      pointerEvents="none"
    >
      <Path
        d="M 0,0 L 300,0 L 300,500 L 0,500 Z M 29,38 L 271,38 L 282,49 L 282,286 L 271,297 L 29,297 L 18,286 L 18,49 Z M 27,311 L 273,311 L 284,322 L 284,390 L 273,401 L 27,401 L 16,390 L 16,322 Z"
        fill="white"
        fillRule="evenodd"
        stroke="none"
      />

      <Rect x="5" y="5" width="290" height="490" fill="none" stroke={N} strokeWidth="1.8" />
      <Rect x="9" y="9" width="282" height="482" fill="none" stroke={N} strokeWidth="0.8" />

      <Path d="M 5,34 L 5,5 L 34,5" fill="none" stroke={N} strokeWidth="3.5" />
      <Path d="M 266,5 L 295,5 L 295,34" fill="none" stroke={N} strokeWidth="3.5" />
      <Path d="M 5,466 L 5,495 L 34,495" fill="none" stroke={N} strokeWidth="3.5" />
      <Path d="M 266,495 L 295,495 L 295,466" fill="none" stroke={N} strokeWidth="3.5" />

      <Path d={octPath(14, 34, 272, 256, 13)} fill="none" stroke={N} strokeWidth="1.8" />
      <Path d={octPath(18, 38, 264, 248, 11)} fill="none" stroke={N} strokeWidth="0.8" />

      <Path d={octPath(14, 298, 272, 105, 13)} fill="none" stroke={N} strokeWidth="1.8" />
      <Path d={octPath(18, 302, 264, 97, 11)} fill="none" stroke={N} strokeWidth="0.8" />
      <Line x1="40" y1="390" x2="260" y2="390" stroke={N} strokeWidth="0.6" opacity="0.2" />

      <Line x1="14" y1="410" x2="286" y2="410" stroke={N} strokeWidth="0.8" />
      <Path d={octPath(14, 417, 194, 70, 5)} fill="none" stroke={N} strokeWidth="1.2" />
      <Line x1="20" y1="435" x2="202" y2="435" stroke={N} strokeWidth="0.6" opacity="0.22" />
      <Line x1="20" y1="451" x2="202" y2="451" stroke={N} strokeWidth="0.6" opacity="0.22" />
      <Line x1="20" y1="467" x2="202" y2="467" stroke={N} strokeWidth="0.6" opacity="0.22" />
      <Path d={octPath(216, 417, 70, 70, 5)} fill="none" stroke={N} strokeWidth="1.2" />
      <Path d={star4(251, 452, 10, 4)} fill={N} opacity="0.2" />
    </Svg>
  );
}

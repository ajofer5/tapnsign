import { DisplayCardFrame, PrintCardFrame } from '@/components/autograph-card-frame';
import { BrandFonts } from '@/constants/theme';
import { CardTemplate, CLASSIC_CARD_TEMPLATE } from '@/lib/card-templates';
import { getDisplayNameFontScale } from '@/lib/display-name';
import { forwardRef, ReactNode } from 'react';
import { Image, ImageSourcePropType, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

type Point = {
  x: number;
  y: number;
  t?: number;
};

export type CardStroke = {
  id: string;
  points: Point[];
};

export const AUTOGRAPH_CARD_TEMPLATE = {
  viewBoxWidth: CLASSIC_CARD_TEMPLATE.baseWidth,
  viewBoxHeight: CLASSIC_CARD_TEMPLATE.baseHeight,
  nameBand: CLASSIC_CARD_TEMPLATE.zones.header,
  cameraWindow: CLASSIC_CARD_TEMPLATE.zones.cameraWindow,
  signatureZone: CLASSIC_CARD_TEMPLATE.zones.signatureZone,
  footerTop: CLASSIC_CARD_TEMPLATE.zones.footerTop,
} as const;

const DEFAULT_INK = '#001B5C';

function buildSvgPath(points: { x: number; y: number }[]) {
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
}

function renderStrokePaths(strokes: CardStroke[], strokeColor: string) {
  return strokes.map((stroke) => {
    const d = buildSvgPath(stroke.points);
    if (!d) return null;
    return (
      <Path
        key={`${stroke.id}-plain`}
        d={d}
        stroke={strokeColor || DEFAULT_INK}
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  });
}

type Props = {
  creatorName: string;
  captureWidth: number;
  captureHeight: number;
  strokes: CardStroke[];
  currentTimeSeconds?: number;
  strokeColor: string;
  template?: CardTemplate;
  sequenceNumber?: number | null;
  photoSource?: ImageSourcePropType;
  cameraContent?: ReactNode;
  signatureContent?: ReactNode;
  statsContent?: ReactNode;
  frameVariant?: 'display' | 'print';
  nameScale?: number;
  style?: StyleProp<ViewStyle>;
};

export const AutographCardCanvas = forwardRef<View, Props>(function AutographCardCanvas(
  {
    creatorName,
    captureWidth,
    captureHeight,
    strokes,
    currentTimeSeconds,
    strokeColor,
    template = CLASSIC_CARD_TEMPLATE,
    sequenceNumber,
    photoSource,
    cameraContent,
    signatureContent,
    statsContent,
    frameVariant = 'display',
    nameScale = 1,
    style,
  },
  ref,
) {
  const effectiveNameScale = nameScale * getDisplayNameFontScale(creatorName);
  const visibleStrokes = currentTimeSeconds == null || !Number.isFinite(currentTimeSeconds)
    ? strokes
    : strokes
        .map((stroke) => ({
          ...stroke,
          points: stroke.points.filter((point) => point.t == null || point.t <= currentTimeSeconds),
        }))
        .filter((stroke) => stroke.points.length > 0);

  return (
    <View ref={ref} collapsable={false} style={[styles.root, style]}>
      <View
        style={[
          styles.nameBand,
          {
            top: `${template.zones.header.top * 100}%`,
            height: `${template.zones.header.height * 100}%`,
          },
          {
            paddingHorizontal: 12 * effectiveNameScale,
            gap: 6 * effectiveNameScale,
          },
          template.frameId === 'ophinia_o' && { zIndex: 35, elevation: 35, marginTop: -14 },
        ]}
        pointerEvents="none"
      >
        {template.showNameLines !== false ? <View style={[styles.nameLine, { width: 42 * effectiveNameScale }, template.nameColor ? { backgroundColor: template.nameColor } : null]} /> : <View style={[styles.nameLineSpacer, { width: 42 * effectiveNameScale }]} />}
        <View style={styles.nameTextGroup}>
          <Text
            style={[
              styles.creatorName,
              {
                fontSize: 28 * effectiveNameScale,
                letterSpacing: 1.2 * effectiveNameScale,
              },
              template.nameColor ? { color: template.nameColor } : null,
            ]}
            numberOfLines={1}
          >
            {creatorName}
          </Text>
          {sequenceNumber != null ? (
            <Text
              style={[
                styles.sequenceNumber,
                { fontSize: 13 * effectiveNameScale },
                template.nameColor ? { color: template.nameColor } : null,
              ]}
            >
              #{sequenceNumber}
            </Text>
          ) : null}
        </View>
        {template.showNameLines !== false ? <View style={[styles.nameLine, { width: 42 * effectiveNameScale }, template.nameColor ? { backgroundColor: template.nameColor } : null]} /> : <View style={[styles.nameLineSpacer, { width: 42 * effectiveNameScale }]} />}
      </View>

      <View
        style={[
          styles.cameraWindow,
template.frameId === 'ophinia_o' ? styles.ophiniaOCameraWindow : null,
          template.frameId === 'classic' ? styles.classicCameraWindow : null,
          {
            left: `${template.zones.cameraWindow.x * 100}%`,
            top: `${template.zones.cameraWindow.y * 100}%`,
            width: `${template.zones.cameraWindow.width * 100}%`,
            height: `${template.zones.cameraWindow.height * 100}%`,
          },
        ]}
      >
        {cameraContent ?? (photoSource ? <Image source={photoSource} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null)}
        {template.frameId === 'classic' ? (
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
            <Path d="M 0,96 L 4,100 L 0,100 Z" fill="white" />
            <Path d="M 100,96 L 96,100 L 100,100 Z" fill="white" />
          </Svg>
        ) : null}
      </View>

      <View
        style={[
          styles.signatureZone,
          {
            left: `${template.zones.signatureZone.x * 100}%`,
            top: `${template.zones.signatureZone.y * 100}%`,
            width: `${template.zones.signatureZone.width * 100}%`,
            height: `${template.zones.signatureZone.height * 100}%`,
          },
        ]}
        pointerEvents="box-none"
      >
        {signatureContent}
      </View>

      {frameVariant === 'print' ? <PrintCardFrame /> : <DisplayCardFrame frameId={template.frameId} />}

      {statsContent}

      <View style={styles.strokeLayer} pointerEvents="none">
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${captureWidth || 1} ${captureHeight || 1}`}
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}
        >
          {frameVariant === 'print' ? (
            <Defs>
              <ClipPath id="cardFooterClip">
                <Rect x="0" y="0" width={captureWidth || 1} height={(captureHeight || 1) * template.zones.footerTop} />
              </ClipPath>
            </Defs>
          ) : null}
          {frameVariant === 'print'
            ? <G clipPath="url(#cardFooterClip)">{renderStrokePaths(visibleStrokes, strokeColor)}</G>
            : renderStrokePaths(visibleStrokes, strokeColor)}
        </Svg>
      </View>

      {template.frameId === 'ophinia_o' && frameVariant !== 'print' ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 25 }]} pointerEvents="none">
          <Image
            source={require('../assets/images/ophinia-o-frame.png')}
            style={{ width: '100%', height: '100%', tintColor: '#000000' }}
            resizeMode="stretch"
          />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  ophiniaOTemplateArt: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 16,
    elevation: 16,
  },
  nameBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    zIndex: 20,
    elevation: 20,
  },
  nameTextGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
    gap: 6,
  },
  nameLine: {
    height: 1,
    width: 42,
    backgroundColor: '#000',
    opacity: 0.45,
  },
  nameLineSpacer: {
    width: 42,
  },
  creatorName: {
    color: '#000',
    fontSize: 28,
    fontFamily: BrandFonts.primary,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sequenceNumber: {
    color: '#000',
    fontSize: 13,
    fontFamily: BrandFonts.primary,
    fontWeight: '600',
    opacity: 0.7,
  },
  cameraWindow: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#111315',
    zIndex: 10,
    elevation: 10,
  },
  classicCameraWindow: {
    borderRadius: 16,
  },
ophiniaOCameraWindow: {
    borderRadius: 28,
  },
  signatureZone: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 12,
    elevation: 12,
  },
  strokeLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
  },
});

import { BrandColors } from '@/constants/theme';
import { CardTemplate } from '@/lib/card-templates/types';

export const BLUR_CARD_TEMPLATE: CardTemplate = {
  id: 'blur',
  name: 'Blur',
  baseWidth: 300,
  baseHeight: 500,
  aspectRatio: {
    width: 60,
    height: 100,
  },
  strokeColor: BrandColors.violet,
  frameId: 'blur',
  nameColor: BrandColors.gold,
  showNameLines: true,
  // Starting from the same 3:5 geometry as Ophinia O until the Blur frame
  // gets its own tuned window/signature layout.
  zones: {
    header: {
      top: 12 / 500,
      height: 28 / 500,
    },
    cameraWindow: {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
    signatureZone: {
      x: 18 / 300,
      y: 398 / 500,
      width: 264 / 300,
      height: 68 / 500,
    },
    footerTop: 1,
    statsBox: {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    },
    qrBox: {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    },
  },
};

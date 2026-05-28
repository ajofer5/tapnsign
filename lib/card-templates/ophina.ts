import { BrandColors } from '@/constants/theme';
import { CardTemplate } from '@/lib/card-templates/types';

export const OPHINA_CARD_TEMPLATE: CardTemplate = {
  id: 'ophina',
  name: 'Ophinia',
  baseWidth: 300,
  baseHeight: 500,
  aspectRatio: {
    width: 60,
    height: 100,
  },
  strokeColor: BrandColors.violet,
  frameId: 'ophina',
  nameColor: BrandColors.gold,
  showNameLines: false,
  zones: {
    header: {
      top: 6 / 500,
      height: 33 / 500,
    },
    cameraWindow: {
      x: 27 / 300,
      y: 44 / 500,
      width: 246 / 300,
      height: 294 / 500,
    },
    signatureZone: {
      x: 18 / 300,
      y: 393 / 500,
      width: 264 / 300,
      height: 74 / 500,
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

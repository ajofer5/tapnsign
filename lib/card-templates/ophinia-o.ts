import { BrandColors } from '@/constants/theme';
import { CardTemplate } from '@/lib/card-templates/types';

export const OPHINIA_O_CARD_TEMPLATE: CardTemplate = {
  id: 'ophinia_o',
  name: 'Ophinia O',
  baseWidth: 300,
  baseHeight: 500,
  aspectRatio: {
    width: 60,
    height: 100,
  },
  strokeColor: BrandColors.violet,
  frameId: 'ophinia_o',
  nameColor: BrandColors.gold,
  showNameLines: false,
  zones: {
    header: {
      top: 12 / 500,
      height: 28 / 500,
    },
    cameraWindow: {
      x: 0.0750,
      y: 0.0565,
      width: 0.8650,
      height: 0.9100,
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

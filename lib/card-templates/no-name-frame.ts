import { CardTemplate } from '@/lib/card-templates/types';

export const NO_NAME_FRAME_CARD_TEMPLATE: CardTemplate = {
  id: 'no_name_frame',
  name: 'No Name',
  baseWidth: 300,
  baseHeight: 500,
  aspectRatio: {
    width: 60,
    height: 100,
  },
  strokeColor: '#001B5C',
  frameId: 'no_name_frame',
  nameColor: '#000000',
  showNameLines: false,
  zones: {
    header: {
      top: 0,
      height: 0,
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

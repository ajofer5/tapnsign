import { CardTemplate } from '@/lib/card-templates/types';

export const CLASSIC_CARD_TEMPLATE: CardTemplate = {
  id: 'classic',
  name: 'Classic',
  baseWidth: 300,
  baseHeight: 500,
  aspectRatio: {
    width: 60,
    height: 100,
  },
  strokeColor: '#001B5C',
  frameId: 'classic',
  nameColor: '#000000',
  showNameLines: true,
  zones: {
    header: {
      top: 0.009,
      height: 0.068,
    },
    cameraWindow: {
      x: 18 / 300,
      y: 40 / 500,
      width: 264 / 300,
      height: 259 / 500,
    },
    signatureZone: {
      x: 16 / 300,
      y: 315 / 500,
      width: 268 / 300,
      height: 141 / 500,
    },
    footerTop: 455 / 500,
    statsBox: {
      x: 16 / 300,
      y: 412 / 500,
      width: 188 / 300,
      height: 56 / 500,
    },
    qrBox: {
      x: 216 / 300,
      y: 412 / 500,
      width: 70 / 300,
      height: 56 / 500,
    },
  },
};

export const CLASSIC_PRINT_TEMPLATE: CardTemplate = {
  id: 'classic-print',
  name: 'Classic Print',
  baseWidth: 300,
  baseHeight: 500,
  aspectRatio: {
    width: 3,
    height: 5,
  },
  strokeColor: '#001B5C',
  frameId: 'classic',
  nameColor: '#000000',
  showNameLines: true,
  zones: {
    header: {
      top: 0.01,
      height: 0.07,
    },
    cameraWindow: {
      x: 18 / 300,
      y: 38 / 500,
      width: 264 / 300,
      height: 248 / 500,
    },
    signatureZone: {
      x: 16 / 300,
      y: 286 / 500,
      width: 268 / 300,
      height: 104 / 500,
    },
    footerTop: 410 / 500,
    statsBox: {
      x: 16 / 300,
      y: 422 / 500,
      width: 188 / 300,
      height: 60 / 500,
    },
    qrBox: {
      x: 221 / 300,
      y: 424 / 500,
      width: 60 / 300,
      height: 60 / 500,
    },
  },
};

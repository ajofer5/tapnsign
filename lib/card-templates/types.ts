export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CardTemplate = {
  id: string;
  name: string;
  baseWidth: number;
  baseHeight: number;
  aspectRatio: {
    width: number;
    height: number;
  };
  strokeColor: string;
  frameId: 'blur' | 'classic' | 'ophinia_o';
  nameColor?: string;
  showNameLines?: boolean;
  zones: {
    header: {
      top: number;
      height: number;
    };
    cameraWindow: NormalizedRect;
    signatureZone: NormalizedRect;
    footerTop: number;
    statsBox: NormalizedRect;
    qrBox: NormalizedRect;
  };
};

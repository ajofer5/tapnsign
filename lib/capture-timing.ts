export const CAPTURE_DURATION_MS = 7100;
export const CAPTURE_COUNTDOWN_START = 7;
// Four progression frames plus one final hero frame.
export const PREVIEW_FRAME_TIMES_MS = [1000, 2550, 4100, 5650, 7050] as const;
export const PREVIEW_PLAYBACK_DURATION_MS = 1600;
export const PREVIEW_PLAYBACK_END_HOLD_MS = 120;

export function getPreviewFrameTimelineMs(frameCount: number): number[] {
  if (frameCount <= 0) return [];
  if (frameCount === PREVIEW_FRAME_TIMES_MS.length) {
    return [...PREVIEW_FRAME_TIMES_MS];
  }
  if (frameCount === 1) {
    return [PREVIEW_FRAME_TIMES_MS[PREVIEW_FRAME_TIMES_MS.length - 1]];
  }

  const first = PREVIEW_FRAME_TIMES_MS[0];
  const last = PREVIEW_FRAME_TIMES_MS[PREVIEW_FRAME_TIMES_MS.length - 1];
  const step = (last - first) / (frameCount - 1);

  return Array.from({ length: frameCount }, (_, index) => Math.round(first + step * index));
}

export function getPreviewFrameTimeSeconds(frameIndex: number, frameCount: number): number {
  const timeline = getPreviewFrameTimelineMs(frameCount);
  if (!timeline.length) return 0;
  const safeIndex = Math.max(0, Math.min(frameIndex, timeline.length - 1));
  return timeline[safeIndex] / 1000;
}

export function getPreviewFramePlaybackDelayMs(frameIndex: number, frameCount: number): number {
  const timeline = getPreviewFrameTimelineMs(frameCount);
  if (timeline.length <= 1) return PREVIEW_PLAYBACK_END_HOLD_MS;
  if (frameIndex >= timeline.length - 1) return PREVIEW_PLAYBACK_END_HOLD_MS;

  const captureSpanMs = Math.max(1, timeline[timeline.length - 1] - timeline[0]);
  const playbackSpanMs = Math.max(1, PREVIEW_PLAYBACK_DURATION_MS - PREVIEW_PLAYBACK_END_HOLD_MS);
  const currentGapMs = Math.max(1, timeline[frameIndex + 1] - timeline[frameIndex]);
  return Math.max(90, Math.round((currentGapMs / captureSpanMs) * playbackSpanMs));
}

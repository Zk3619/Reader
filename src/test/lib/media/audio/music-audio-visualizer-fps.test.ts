import { describe, expect, it } from 'vitest';
import {
  clampVisualizerFps,
  visualizerFrameIntervalMs,
  VISUALIZER_FPS_DEFAULT,
} from '@/lib/media/audio/music-audio-visualizer-fps';

describe('music-audio-visualizer-fps', () => {
  it('defaults invalid fps to 60', () => {
    expect(clampVisualizerFps(undefined)).toBe(VISUALIZER_FPS_DEFAULT);
    expect(clampVisualizerFps(NaN)).toBe(60);
  });

  it('clamps fps to 15–120', () => {
    expect(clampVisualizerFps(10)).toBe(15);
    expect(clampVisualizerFps(200)).toBe(120);
    expect(clampVisualizerFps(59.7)).toBe(60);
  });

  it('derives frame interval from fps', () => {
    expect(visualizerFrameIntervalMs(60)).toBeCloseTo(1000 / 60, 5);
    expect(visualizerFrameIntervalMs(30)).toBeCloseTo(1000 / 30, 5);
  });
});

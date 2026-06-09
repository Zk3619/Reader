import { describe, expect, it, beforeEach } from 'vitest';
import {
  resetMediaConvertCapabilitiesCache,
  supportsImageTargetFormat,
  supportsAudioTargetFormat,
  type ResolvedMediaConvertCapabilities,
} from '@/lib/media/media-convert-capabilities';

const webCaps: ResolvedMediaConvertCapabilities = {
  platform: 'web',
  image: {
    available: true,
    backends: ['canvas'],
    formats: ['jpeg', 'png'],
    preferred: 'canvas',
  },
  audio: {
    available: false,
    backends: [],
    formats: [],
    preferred: 'none',
  },
  video: {
    available: false,
    backends: [],
    formats: [],
    preferred: 'none',
  },
};

describe('media convert capabilities', () => {
  beforeEach(() => {
    resetMediaConvertCapabilitiesCache();
  });

  it('original format is always supported', () => {
    expect(supportsImageTargetFormat(webCaps, 'original')).toBe(true);
    expect(supportsAudioTargetFormat(webCaps, 'original')).toBe(true);
  });

  it('respects per-platform format lists', () => {
    expect(supportsImageTargetFormat(webCaps, 'jpeg')).toBe(true);
    expect(supportsImageTargetFormat(webCaps, 'webp')).toBe(false);
    expect(supportsAudioTargetFormat(webCaps, 'mp3')).toBe(false);
  });
});

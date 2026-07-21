import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTrackLyricOffsetSec,
  getTrackLyricOffsetSec,
  musicLyricOffsetTrackKey,
  resolveEffectiveLyricOffsetSec,
  setTrackLyricOffsetSec,
} from '@/lib/media/audio/music-lyric-offset';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
});

describe('resolveEffectiveLyricOffsetSec', () => {
  it('returns global when track key missing', () => {
    expect(resolveEffectiveLyricOffsetSec(1.5, null)).toBe(1.5);
    expect(resolveEffectiveLyricOffsetSec(1.5, undefined)).toBe(1.5);
    expect(resolveEffectiveLyricOffsetSec(Number.NaN, null)).toBe(0);
  });

  it('adds per-track offset to global', () => {
    const key = musicLyricOffsetTrackKey('kw', 'song1');
    setTrackLyricOffsetSec(key, 0.8);
    expect(getTrackLyricOffsetSec(key)).toBe(0.8);
    expect(resolveEffectiveLyricOffsetSec(1.2, key)).toBeCloseTo(2.0, 5);
    clearTrackLyricOffsetSec(key);
    expect(resolveEffectiveLyricOffsetSec(1.2, key)).toBe(1.2);
  });
});

import { describe, expect, it } from 'vitest';
import {
  attachToggleMusicInfo,
  getToggleMusicInfo,
} from '@/lib/media/audio/track-toggle';
import type { AudioTrack } from '@/lib/media/audio/track-types';

const wy: AudioTrack = {
  id: 'wy__1',
  name: '歌',
  artist: '歌手',
  source: 'wy',
  duration: '03:00',
  meta: { songId: '1' },
};

const kw: AudioTrack = {
  id: 'kw__2',
  name: '歌',
  artist: '歌手',
  source: 'kw',
  duration: '03:00',
  meta: { songId: '2', coverUrl: 'https://cover' },
};

describe('track-toggle', () => {
  it('attachToggleMusicInfo keeps original id and hangs alt', () => {
    const merged = attachToggleMusicInfo(wy, kw);
    expect(merged.id).toBe('wy__1');
    expect(merged.source).toBe('wy');
    expect(getToggleMusicInfo(merged)?.id).toBe('kw__2');
    expect(merged.meta.coverUrl).toBe('https://cover');
  });
});

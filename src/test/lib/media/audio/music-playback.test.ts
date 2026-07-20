import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pickLyricText } from '@/lib/media/audio/lyric-types';
import {
  getPlayQuality,
  listPlayQualityPreferenceOptions,
  qualityFallbackChain,
  resolvePlayQualityPreference,
} from '@/lib/media/audio/music-quality';

describe('playback chain helpers', () => {
  it('pickLyricText falls back to lyric', () => {
    expect(pickLyricText({ lyric: 'hello' }, 'tlyric')).toBe('hello');
  });

  it('quality chain includes flac after 320k preference index', () => {
    const chain = qualityFallbackChain('flac');
    expect(chain[0]).toBe('flac');
    expect(chain).toContain('320k');
  });

  it('getPlayQuality returns a known label key', () => {
    const q = getPlayQuality();
    expect(['128k', '192k', '320k', 'flac', 'flac24bit', 'ape', 'wav']).toContain(q);
  });

  it('resolves dynamic highest and lowest quality preferences', () => {
    const available = ['128k', '320k', 'flac'] as const;
    expect(resolvePlayQualityPreference('highest', available)).toBe('flac');
    expect(resolvePlayQualityPreference('lowest', available)).toBe('128k');
  });

  it('always exposes highest and lowest quality preference options', () => {
    expect(listPlayQualityPreferenceOptions()).toEqual(
      expect.arrayContaining(['lowest', 'highest']),
    );
  });
});

/**
 * 回归：applyMusicTrack 写入 musicMediaUrls / musicPrimaryUrl；
 * Hub 播放器若仍读 mediaUrls / primaryUrl，音源取链成功也无法播放（长青等代理源尤甚）。
 */
describe('music hub playback url fields', () => {
  it('useMusicHubPlayer binds music* urls/loading/error, not content mediaUrls', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/media/viewer/audio/music/hub/useMusicHubPlayer.ts'),
      'utf8',
    );
    expect(src).toMatch(/state\(\)\.musicPrimaryUrl/);
    expect(src).toMatch(/state\(\)\.musicMediaUrls/);
    expect(src).toMatch(/state\(\)\.musicLoading/);
    expect(src).toMatch(/state\(\)\.musicError/);
    expect(src).not.toMatch(/const url = \(\) => state\(\)\.primaryUrl/);
    expect(src).not.toMatch(/const mediaUrls = \(\) => state\(\)\.mediaUrls/);
    expect(src).not.toMatch(/const loading = \(\) => state\(\)\.loading/);
    expect(src).not.toMatch(/const error = \(\) => state\(\)\.error/);
  });

  it('applyMusicTrack resets musicPositionSec atomically when switching tracks', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/stores/viewer/media/audio.ts'),
      'utf8',
    );
    expect(src).toMatch(/resolveMusicTrackStartPositionSec/);
    expect(src).toMatch(/musicPositionSec,/);
    expect(src).toMatch(/musicTrackAdvanceInFlight/);
    expect(src).toMatch(/clearCurrentTrackProgressForAdvance/);
  });

  it('useMusicHubPlayer does not restore per-track localStorage progress on track switch', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/media/viewer/audio/music/hub/useMusicHubPlayer.ts'),
      'utf8',
    );
    // 切歌只归零；续播仅由 session hydrate / applyMusicTrack(sameTrack) 负责
    expect(src).toMatch(/if \(trackChanged\) setMusicPositionSec\(0\)/);
    expect(src).not.toMatch(/readMusicTrackProgress/);
    expect(src).not.toMatch(/readTrackProgress\(/);
  });
});

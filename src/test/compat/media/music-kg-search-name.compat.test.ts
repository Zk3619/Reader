import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '@/lib/media/text/decode-html-entities';
import { trackBadgeToneClass, trackQualityBadge } from '@/lib/media/audio/music-search-result-ui';
import type { AudioTrack } from '@/lib/media/audio/track-types';

/** 与 kg.ts formatKgSongName 同源逻辑，便于单元测试 */
function formatKgSongName(item: {
  OriSongName?: unknown;
  SongName?: unknown;
  Suffix?: unknown;
}): string {
  const ori = String(item.OriSongName ?? item.SongName ?? '');
  const suffix = String(item.Suffix ?? '').trim();
  const raw = suffix ? `${ori} ${suffix}` : ori;
  return decodeHtmlEntities(raw) || '未知';
}

describe('kg search song name (lx #2782)', () => {
  it('joins OriSongName and Suffix with a space', () => {
    expect(
      formatKgSongName({
        OriSongName: '平庸',
        SongName: '平庸 (Live)',
        Suffix: '(Live)',
      }),
    ).toBe('平庸 (Live)');
  });

  it('falls back to SongName when OriSongName missing', () => {
    expect(formatKgSongName({ SongName: '野心' })).toBe('野心');
  });
});

describe('trackQualityBadge (lx OnlineList tags)', () => {
  const base = {
    id: 'x',
    name: 't',
    artist: 'a',
    source: 'kg' as const,
    duration: '03:00',
  };

  it('maps flac24bit / flac / 320k to 24bit / SQ / HQ', () => {
    expect(
      trackQualityBadge({
        ...base,
        meta: { _qualitys: { flac24bit: {}, flac: {}, '320k': {}, '128k': {} } },
      } as AudioTrack),
    ).toEqual({ label: '24bit', tone: 'hires' });
    expect(
      trackQualityBadge({
        ...base,
        meta: { _qualitys: { flac: {}, '320k': {} } },
      } as AudioTrack),
    ).toEqual({ label: 'SQ', tone: 'sq' });
    expect(
      trackQualityBadge({
        ...base,
        meta: { _qualitys: { '320k': {}, '128k': {} } },
      } as AudioTrack),
    ).toEqual({ label: 'HQ', tone: 'hq' });
  });

  it('hides badge when only 128k', () => {
    expect(
      trackQualityBadge({
        ...base,
        meta: { _qualitys: { '128k': {} } },
      } as AudioTrack),
    ).toBeNull();
  });

  it('exposes distinct non-theme tone classes', () => {
    expect(trackBadgeToneClass('hires')).toContain('text-violet');
    expect(trackBadgeToneClass('sq')).toContain('text-emerald');
    expect(trackBadgeToneClass('hq')).toContain('text-sky');
    expect(trackBadgeToneClass('source')).toContain('text-amber');
    expect(trackBadgeToneClass('hires')).not.toContain('text-primary');
    expect(trackBadgeToneClass('sq')).not.toContain('text-primary');
  });
});

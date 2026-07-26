import { describe, expect, it } from 'vitest';
import { currentLyricLine } from '@/lib/media/audio/current-lyric-line';
import {
  normalizeMfStyleLrcTimestamps,
  parseLrcTimeTagToMs,
} from '@/lib/media/audio/lrc-time';

describe('currentLyricLine', () => {
  const sample = `[00:00.00]前奏
[00:12.50]第一句歌词
[00:25.00]第二句歌词
[01:00.00]副歌`;

  it('returns the active timed line', () => {
    expect(currentLyricLine(sample, 0)).toBe('前奏');
    expect(currentLyricLine(sample, 12.5)).toBe('第一句歌词');
    expect(currentLyricLine(sample, 30)).toBe('第二句歌词');
    expect(currentLyricLine(sample, 90)).toBe('副歌');
  });

  it('shows first timed line before its timestamp (playback just started)', () => {
    const lateStart = `[00:12.50]第一句歌词\n[00:25.00]第二句歌词`;
    expect(currentLyricLine(lateStart, 0)).toBe('第一句歌词');
    expect(currentLyricLine(lateStart, 5)).toBe('第一句歌词');
    expect(currentLyricLine(lateStart, 12.5)).toBe('第一句歌词');
  });

  it('falls back to first plain line without timestamps', () => {
    expect(currentLyricLine('纯文本歌词\n第二行', 10)).toBe('纯文本歌词');
  });

  it('returns empty when lyric text is empty', () => {
    expect(currentLyricLine('', 0)).toBe('');
    expect(currentLyricLine('   \n', 0)).toBe('');
  });

  it('supports MusicFree second-only timestamps', () => {
    const mf = `[13.47]第一句\n[19.74]第二句\n[79.00]副歌`;
    expect(currentLyricLine(mf, 0)).toBe('第一句');
    expect(currentLyricLine(mf, 13.47)).toBe('第一句');
    expect(currentLyricLine(mf, 20)).toBe('第二句');
    expect(currentLyricLine(mf, 80)).toBe('副歌');
  });
});

describe('lrc-time', () => {
  it('parses standard and second-only tags', () => {
    expect(parseLrcTimeTagToMs('[00:13.47]')).toBe(13_000 + 47);
    expect(parseLrcTimeTagToMs('[13.47]')).toBe(13_470);
    expect(parseLrcTimeTagToMs('[79]')).toBe(79_000);
  });

  it('normalizes second-only tags to mm:ss', () => {
    expect(normalizeMfStyleLrcTimestamps('[13.47]hi\n[79.5]yo')).toBe(
      '[00:13.47]hi\n[01:19.50]yo',
    );
  });
});

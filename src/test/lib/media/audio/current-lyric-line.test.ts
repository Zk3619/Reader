import { describe, expect, it } from 'vitest';
import { currentLyricLine } from '@/lib/media/audio/current-lyric-line';

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

  it('falls back to first plain line without timestamps', () => {
    expect(currentLyricLine('纯文本歌词\n第二行', 10)).toBe('纯文本歌词');
  });
});

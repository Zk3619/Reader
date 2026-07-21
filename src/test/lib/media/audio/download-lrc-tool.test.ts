import { describe, expect, it } from 'vitest';
import { buildLyrics } from '@/lib/media/audio/download-lrc-tool';

describe('buildLyrics', () => {
  const bundle = {
    lyric: '[00:01.00]你好\n[00:02.00]世界',
    tlyric: '[00:01.00]Hello\n[00:02.00]World\n[00:03.00]Extra',
    rlyric: '[00:01.00]ni hao',
    lxlyric: '[00:01.00]<0,100>你',
  };

  it('returns main lyric when no extended tracks requested', () => {
    const out = buildLyrics(
      { lyric: bundle.lyric },
      { includeLx: false, includeT: false, includeR: false },
    );
    expect(out).toBe(bundle.lyric);
  });

  it('appends translation lines matching main timestamps only', () => {
    const out = buildLyrics(bundle, {
      includeLx: false,
      includeT: true,
      includeR: false,
    });
    expect(out).toContain('Hello');
    expect(out).toContain('World');
    expect(out).not.toContain('Extra');
  });

  it('appends awlrc block when includeLx', () => {
    const out = buildLyrics(bundle, {
      includeLx: true,
      includeT: false,
      includeR: false,
    });
    expect(out).toMatch(/\[awlrc:lrc:/);
    expect(out).toContain('awlrc:');
  });

  it('can include roma lines', () => {
    const out = buildLyrics(bundle, {
      includeLx: false,
      includeT: false,
      includeR: true,
    });
    expect(out).toContain('ni hao');
  });
});

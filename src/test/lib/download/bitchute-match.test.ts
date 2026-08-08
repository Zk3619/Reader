import { describe, expect, it } from 'vitest';
import '@/lib/download/ytdlp/extractors';
import {
  BitChuteIE,
  bitchuteSeedCandidates,
} from '@/lib/download/ytdlp/extractors/hand-b/bitchute';
import { ensureBuiltinLoaded, getExtractorForUrl } from '@/lib/download/ytdlp/registry';
import { detectProtocol } from '@/lib/download/gopeed/resolve';

describe('BitChuteIE', () => {
  it('matches video URLs', () => {
    const url = 'https://www.bitchute.com/video/UGlrF9o9b-Q/';
    expect(BitChuteIE.suitable(url)).toBe(true);
    ensureBuiltinLoaded();
    expect(getExtractorForUrl(url)?.IE_NAME).toBe('bitchute');
  });

  it('is detected as ytdlp protocol', () => {
    expect(detectProtocol('https://www.bitchute.com/video/UGlrF9o9b-Q/')).toBe('ytdlp');
  });

  it('expands seed host candidates', () => {
    const url = 'https://seed123.bitchute.com/video/UGlrF9o9b-Q.mp4';
    const list = bitchuteSeedCandidates(url);
    expect(list[0]).toBe(url);
    expect(list).toContain('https://seed122.bitchute.com/video/UGlrF9o9b-Q.mp4');
    expect(list).toContain('https://seedp29xb.bitchute.com/video/UGlrF9o9b-Q.mp4');
    expect(new Set(list).size).toBe(list.length);
  });
});

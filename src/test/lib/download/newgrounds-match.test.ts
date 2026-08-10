import { describe, expect, it } from 'vitest';
import '@/lib/download/ytdlp/extractors';
import { NewgroundsIE } from '@/lib/download/ytdlp/extractors/hand-n/newgrounds';
import { ensureBuiltinLoaded, getExtractorForUrl } from '@/lib/download/ytdlp/registry';
import { detectProtocol } from '@/lib/download/gopeed/resolve';

describe('NewgroundsIE', () => {
  it('matches portal and audio URLs', () => {
    const portal = 'https://www.newgrounds.com/portal/view/689400';
    const audio = 'https://www.newgrounds.com/audio/listen/549479';
    expect(NewgroundsIE.suitable(portal)).toBe(true);
    expect(NewgroundsIE.suitable(audio)).toBe(true);
    ensureBuiltinLoaded();
    expect(getExtractorForUrl(portal)?.IE_NAME).toBe('newgrounds');
  });

  it('is detected as ytdlp protocol (not generic http)', () => {
    expect(detectProtocol('https://www.newgrounds.com/portal/view/689400')).toBe('ytdlp');
  });

  it('detects via registry without host whitelist', () => {
    // 任意已注册站点 VALID_URL 即可，不依赖 resolve.ts 白名单
    expect(detectProtocol('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('ytdlp');
    expect(detectProtocol('https://example.com/video.mp4')).toBe('http');
  });
});
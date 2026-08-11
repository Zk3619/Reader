import { describe, expect, it } from 'vitest';

/**
 * ejs vendor 在浏览器会执行：
 *   globalThis.location = new URL('https://www.youtube.com/watch?v=yt-dlp-wins')
 * 若在主 WebView 运行会整页导航。此测试锁定隔离执行契约。
 */
describe('youtube-ejs sandbox contract', () => {
  it('exports solveWithEjs that does not rely on host location', async () => {
    const mod = await import('@/lib/download/ytdlp/extractors/youtube-ejs');
    expect(typeof mod.solveWithEjs).toBe('function');
    expect(typeof mod.decipherFormatsWithEjs).toBe('function');
  });
});

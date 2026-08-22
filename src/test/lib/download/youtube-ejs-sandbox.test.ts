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

  it('parses official ejs response shape (data + request index), not results/type:n', () => {
    // 官方 Output：responses[i] ↔ requests[i]，成功项为 { type:'result', data }
    const requests = [{ type: 'sig' as const }, { type: 'n' as const }];
    const responses = [
      { type: 'result', data: { encSig: 'decSig' } },
      { type: 'result', data: { encN: 'decN' } },
    ];
    const n: Record<string, string> = {};
    const sig: Record<string, string> = {};
    for (let i = 0; i < responses.length; i++) {
      const row = responses[i]!;
      const map = row.data || {};
      const reqType = requests[i]?.type;
      if (reqType === 'n') Object.assign(n, map);
      else if (reqType === 'sig') Object.assign(sig, map);
    }
    expect(sig).toEqual({ encSig: 'decSig' });
    expect(n).toEqual({ encN: 'decN' });
    // 旧错误解析（找 type:n / results）会得到空表 → 写出无签名 url → 0% 403
    const brokenN: Record<string, string> = {};
    const brokenSig: Record<string, string> = {};
    for (const resp of responses) {
      const row = resp as { type?: string; results?: Record<string, string> };
      const results = row.results || {};
      if (row.type === 'n') Object.assign(brokenN, results);
      if (row.type === 'sig') Object.assign(brokenSig, results);
    }
    expect(brokenN).toEqual({});
    expect(brokenSig).toEqual({});
  });
});

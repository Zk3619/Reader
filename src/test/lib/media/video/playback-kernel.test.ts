import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildAnime4KShaderFiles,
  joinGlslShadersArg,
  resolveShaderPaths,
} from '@/lib/media/video/playback/anime4k';
import { resolvePlaybackEngine, resolvePlaybackEngineWithPrefs } from '@/lib/media/video/playback/router';
import { setArtplayerOnlyProfileForTest } from '@/lib/media/video/playback/video-profile';
import { detectSniffUrlsFromText } from '@/lib/media/video/sniff/browser-sniff';
import {
  BANGUMI_ISOLATION_NOTE,
  exportRulesJson,
  importRulesJson,
  normalizeBangumiRule,
  type BangumiRule,
} from '@/lib/media/video/bangumi/rules';
import { isVideoFileName } from '@/lib/media/video/library/local-scan';

describe('video playback anime4k', () => {
  it('builds official mode A chain (Clamp first, AutoDownscale, no v suffix)', () => {
    const files = buildAnime4KShaderFiles('A', 'balanced');
    expect(files[0]).toBe('Anime4K_Clamp_Highlights.glsl');
    expect(files).toContain('Anime4K_Restore_CNN_M.glsl');
    expect(files).toContain('Anime4K_Upscale_CNN_x2_M.glsl');
    expect(files).toContain('Anime4K_AutoDownscalePre_x2.glsl');
    expect(files).toContain('Anime4K_AutoDownscalePre_x4.glsl');
    expect(files).toContain('Anime4K_Upscale_CNN_x2_S.glsl');
    expect(files.every((f) => !f.includes('CNNv'))).toBe(true);
  });

  it('uses Restore_Soft for mode B', () => {
    const files = buildAnime4KShaderFiles('B', 'fast');
    expect(files.some((f) => f.includes('Restore_CNN_Soft'))).toBe(true);
  });

  it('uses Upscale_Denoise for mode C', () => {
    const files = buildAnime4KShaderFiles('C', 'high');
    expect(files.some((f) => f.includes('Upscale_Denoise'))).toBe(true);
  });

  it('appends deblur when requested', () => {
    const files = buildAnime4KShaderFiles('A', 'balanced', { deblur: true });
    expect(files[files.length - 1]).toBe('Anime4K_Deblur_DoG.glsl');
  });

  it('joins glsl arg with semicolon on windows paths', () => {
    expect(joinGlslShadersArg(['D:\\a.glsl', 'D:\\b.glsl'])).toBe(
      'D:\\a.glsl;D:\\b.glsl',
    );
  });

  it('resolves with dir', () => {
    const paths = resolveShaderPaths('D:/shaders', 'A', 'fast');
    expect(paths[0]).toMatch(/^D:[\\/]shaders/);
    expect(paths[0].endsWith('Anime4K_Clamp_Highlights.glsl')).toBe(true);
  });
});

describe('playback router', () => {
  beforeEach(() => {
    // 路由规则单测按增强配置验证；默认产品为 lite
    setArtplayerOnlyProfileForTest(false);
  });
  afterEach(() => {
    setArtplayerOnlyProfileForTest(null);
  });

  it('routes file to libmpv', () => {
    expect(
      resolvePlaybackEngine({ url: 'file:///a.mkv', sourceKind: 'file' }),
    ).toBe('libmpv');
  });

  it('routes hub stream to artplayer', () => {
    expect(
      resolvePlaybackEngine({
        url: 'https://cdn.example/a.m3u8',
        sourceKind: 'hub_stream',
      }),
    ).toBe('artplayer');
  });

  it('honors per-call forceEngine artplayer for local files', () => {
    expect(
      resolvePlaybackEngine({
        url: 'C:\\Videos\\a.mp4',
        sourceKind: 'file',
        forceEngine: 'artplayer',
      }),
    ).toBe('artplayer');
  });

  it('honors per-call forceEngine external', () => {
    expect(
      resolvePlaybackEngine({
        url: 'C:\\Videos\\a.mp4',
        sourceKind: 'file',
        forceEngine: 'external',
      }),
    ).toBe('external');
  });

  it('uses localEngine when forceEngine is auto', () => {
    expect(
      resolvePlaybackEngineWithPrefs(
        { url: 'C:\\Videos\\a.mp4', sourceKind: 'file' },
        { forceEngine: 'auto', localEngine: 'artplayer' },
      ),
    ).toBe('artplayer');
    expect(
      resolvePlaybackEngineWithPrefs(
        { url: 'https://dav.example/a.mkv', sourceKind: 'webdav' },
        { forceEngine: 'auto', localEngine: 'external' },
      ),
    ).toBe('external');
    expect(
      resolvePlaybackEngineWithPrefs(
        { url: 'C:\\Videos\\a.mp4', sourceKind: 'file' },
        { forceEngine: 'libmpv', localEngine: 'artplayer' },
      ),
    ).toBe('libmpv');
  });

  it('routes sniff to external by default', () => {
    expect(
      resolvePlaybackEngineWithPrefs(
        { url: 'https://cdn.example/a.m3u8', sourceKind: 'sniff' },
        { forceEngine: 'auto', localEngine: 'libmpv' },
      ),
    ).toBe('external');
  });

  it('lite keeps sniff/external while mapping libmpv to artplayer', () => {
    setArtplayerOnlyProfileForTest(true);
    expect(
      resolvePlaybackEngineWithPrefs(
        { url: 'https://cdn.example/a.m3u8', sourceKind: 'sniff' },
        { forceEngine: 'auto', localEngine: 'libmpv' },
      ),
    ).toBe('external');
    expect(
      resolvePlaybackEngineWithPrefs(
        { url: 'C:\\Videos\\a.mp4', sourceKind: 'file' },
        { forceEngine: 'auto', localEngine: 'libmpv' },
      ),
    ).toBe('artplayer');
    setArtplayerOnlyProfileForTest(false);
  });

  it('forceEngine overrides sniff default', () => {
    expect(
      resolvePlaybackEngineWithPrefs(
        { url: 'https://cdn.example/a.m3u8', sourceKind: 'sniff' },
        { forceEngine: 'artplayer', localEngine: 'libmpv' },
      ),
    ).toBe('artplayer');
  });
});

describe('danmaku converters', () => {
  it('parses dandan comments', async () => {
    const { danDanCommentsToDanmu } = await import('@/lib/media/video/danmaku/to-artplayer');
    const danmu = danDanCommentsToDanmu({
      comments: [{ p: '12.5,1,16777215', m: 'hello' }],
    });
    expect(danmu[0]?.text).toBe('hello');
    expect(danmu[0]?.time).toBe(12.5);
  });

  it('parses bili xml', async () => {
    const { biliXmlToDanmu } = await import('@/lib/media/video/danmaku/to-artplayer');
    const danmu = biliXmlToDanmu('<i><d p="1.0,1,25,16777215,0,0,0,0">hi</d></i>');
    expect(danmu[0]?.text).toBe('hi');
  });
});

describe('sniff + library helpers', () => {
  it('detects m3u8 in text', () => {
    const hits = detectSniffUrlsFromText(
      'play https://x.test/v.m3u8?token=1 and done',
    );
    expect(hits.some((h) => h.kind === 'hls')).toBe(true);
  });

  it('recognizes video extensions', () => {
    expect(isVideoFileName('a.mkv')).toBe(true);
    expect(isVideoFileName('a.txt')).toBe(false);
  });

  it('keeps bangumi isolation note', () => {
    expect(BANGUMI_ISOLATION_NOTE).toContain('MUST NOT');
  });

  it('rejects FongMi sites import', () => {
    expect(() => importRulesJson(JSON.stringify({ sites: [{ key: 'x' }] }))).toThrow(
      /sites/,
    );
  });

  it('normalizes rule to v2', () => {
    const r = normalizeBangumiRule({
      id: 'a',
      name: 'n',
      baseUrl: 'https://x.test',
      searchPath: '/s?q={keyword}',
    });
    expect(r?.version).toBe(2);
    expect(r?.searchPath).toContain('{keyword}');
  });

  it('exports versioned package', () => {
    const rules: BangumiRule[] = [
      {
        id: 'a',
        name: 'n',
        baseUrl: 'https://x.test',
        enabled: true,
        version: 2,
      },
    ];
    const json = exportRulesJson(rules);
    expect(JSON.parse(json).version).toBe(2);
  });
});

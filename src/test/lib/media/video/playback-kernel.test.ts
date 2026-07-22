import { describe, expect, it } from 'vitest';
import {
  buildAnime4KShaderFiles,
  joinGlslShadersArg,
  resolveShaderPaths,
} from '@/lib/media/video/playback/anime4k';
import { resolvePlaybackEngine } from '@/lib/media/video/playback/router';
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
  it('builds mode A chain', () => {
    const files = buildAnime4KShaderFiles('A', 'balanced');
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.includes('Upscale'))).toBe(true);
  });

  it('joins glsl arg', () => {
    expect(joinGlslShadersArg(['a.glsl', 'b.glsl'])).toBe('a.glsl;b.glsl');
  });

  it('resolves with dir', () => {
    const paths = resolveShaderPaths('D:/shaders', 'A', 'fast');
    expect(paths[0]).toMatch(/^D:\/shaders/);
  });
});

describe('playback router', () => {
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

/**
 * 番剧历史展示：flag JSON 不得泄漏到 sourceLine；站点显示「番剧」
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildTvKeepDisplayMeta } from '@/lib/media/tv/tv-keep-meta';
import { encodeBangumiFlag } from '@/lib/media/video/bangumi/dao-bridge';
import * as BangumiRules from '@/lib/media/video/bangumi/rules';

describe('buildTvKeepDisplayMeta bangumi flag', () => {
  beforeEach(() => {
    vi.spyOn(BangumiRules, 'loadBangumiRules').mockReturnValue([
      {
        id: 'kz_gugu3_https_www_gugu3_com_',
        name: 'gugu3',
        baseUrl: 'https://www.gugu3.com',
        enabled: true,
        version: 2,
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not leak JSON flag into sourceLine', () => {
    const flag = encodeBangumiFlag({
      bgmId: 501963,
      ruleId: 'kz_gugu3_https_www_gugu3_com_',
      detailUrl: 'https://www.gugu3.com/index.php/vod/detail/id/123.html',
      episodeUrl: 'https://www.gugu3.com/ep/1.html',
    });

    const meta = buildTvKeepDisplayMeta({
      siteKey: 'bangumi',
      kind: 'bangumi',
      flag,
      episode: '第01集',
      position: 0,
      duration: 0,
    });

    expect(meta.sourceLine).not.toMatch(/\{/);
    expect(meta.sourceLine).not.toContain('_bg');
    expect(meta.sourceLine).not.toContain('bgmId');
    expect(meta.sourceLine).toContain('番剧');
    expect(meta.sourceLine).toContain('gugu3');
    expect(meta.flag).toBe('gugu3');
  });

  it('labels bangumi site as 番剧 even when rule name missing', () => {
    vi.mocked(BangumiRules.loadBangumiRules).mockReturnValue([]);
    const flag = encodeBangumiFlag({
      bgmId: 1,
      ruleId: 'missing_rule',
    });
    const meta = buildTvKeepDisplayMeta({
      siteKey: 'bangumi',
      kind: 'bangumi',
      flag,
    });
    expect(meta.sourceLine).toBe('番剧');
    expect(meta.sourceLine).not.toMatch(/\{/);
  });
});

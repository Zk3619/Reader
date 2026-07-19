/**
 * 影视兼容性：配置 / 播放 / 直播 / 网络策略 / catchup / 偏好合并
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeStarBase64,
  parseConfigText,
} from '@/lib/media/tv/config/decoder';
import {
  clearVodConfig,
  getSites,
  loadVodConfigFromText,
  seedSitePrefCache,
} from '@/lib/media/tv/config/vod-config';
import { parsePlayFlags } from '@/lib/media/tv/play/flags';
import { parseM3u, parseTxtGenre } from '@/lib/media/tv/live/parser';
import {
  catchupFromChannelAttrs,
  formatCatchupUrl,
} from '@/lib/media/tv/live/catchup';
import {
  applyNetworkPolicy,
  isAdHost,
  resolveHostOverride,
  setTvNetSettings,
} from '@/lib/media/tv/net/rules';
import * as VodConfig from '@/lib/media/tv/config/vod-config';

describe('tv config decoder', () => {
  it('parses minimal vod config', () => {
    const cfg = parseConfigText(
      JSON.stringify({
        sites: [
          {
            key: 'demo',
            name: 'Demo',
            type: 1,
            api: 'https://example.com/api.php/provide/vod/',
          },
        ],
        parses: [],
      }),
    );
    expect(cfg.sites?.[0]?.key).toBe('demo');
  });

  it('decodes ** star base64 segment', () => {
    const payload = btoa('{"sites":[],"parses":[]}');
    const raw = `abcdefgh**${payload}`;
    const out = decodeStarBase64(raw);
    expect(out).toContain('"sites"');
  });
});

describe('tv play flags', () => {
  it('splits flags and episodes', () => {
    const flags = parsePlayFlags(
      '线路A$$$线路B',
      '第1集$http://a/1.m3u8#第2集$http://a/2.m3u8$$$高清$http://b/1.mp4',
    );
    expect(flags).toHaveLength(2);
    expect(flags[0]!.episodes).toHaveLength(2);
    expect(flags[1]!.episodes[0]!.url).toContain('b/1.mp4');
  });
});

describe('tv live parsers', () => {
  it('parses m3u group-title and catchup attrs', () => {
    const groups = parseM3u(`#EXTM3U
#EXTINF:-1 group-title="新闻" catchup="default" catchup-source="?utc={utc:yyyyMMddHHmmss}",CCTV1
http://example.com/1.m3u8
`);
    expect(groups[0]?.name).toBe('新闻');
    expect(groups[0]?.channel[0]?.name).toBe('CCTV1');
    expect(groups[0]?.channel[0]?.catchup).toBe('default');
    expect(groups[0]?.channel[0]?.catchupSource).toContain('utc=');
  });

  it('parses txt genre', () => {
    const groups = parseTxtGenre(`央视,#genre#
CCTV1,http://a
`);
    expect(groups[0]?.name).toBe('央视');
    expect(groups[0]?.channel[0]?.urls[0]).toBe('http://a');
  });
});

describe('tv catchup expand', () => {
  it('appends catchup-source with utc tokens', () => {
    const spec = catchupFromChannelAttrs(
      'append',
      '?start={utc:yyyyMMddHHmmss}&end={utcend:yyyyMMddHHmmss}',
    );
    expect(spec).not.toBeNull();
    const start = Date.UTC(2024, 0, 1, 12, 0, 0);
    const stop = start + 3600_000;
    const url = formatCatchupUrl(
      'http://live.example/ch.m3u8',
      { channelId: '1', title: '新闻', start, stop },
      spec!,
    );
    expect(url.startsWith('http://live.example/ch.m3u8?')).toBe(true);
    expect(url).toContain(`start=${Math.floor(start / 1000)}`);
    expect(url).toContain(`end=${Math.floor(stop / 1000)}`);
  });

  it('default type returns absolute catchup url', () => {
    const start = Date.UTC(2024, 0, 1, 8, 0, 0);
    const url = formatCatchupUrl(
      'http://live.example/ch.m3u8',
      {
        channelId: '1',
        title: 'x',
        start,
        stop: Date.UTC(2024, 0, 1, 9, 0, 0),
      },
      {
        type: 'default',
        source: 'http://replay.example/{utc:yyyyMMddHHmmss}.ts',
      },
    );
    expect(url).toBe(`http://replay.example/${Math.floor(start / 1000)}.ts`);
  });
});

describe('tv network policy', () => {
  beforeEach(() => {
    setTvNetSettings({
      dohEnabled: false,
      proxyEnabled: false,
      proxyUrl: '',
      dohUrl: 'https://dns.alidns.com/dns-query',
    });
    vi.spyOn(VodConfig, 'getAds').mockReturnValue(['ads.evil.com']);
    vi.spyOn(VodConfig, 'getHosts').mockReturnValue(['cdn.example.com=1.2.3.4']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('blocks ad hosts', () => {
    expect(isAdHost('ads.evil.com')).toBe(true);
    expect(isAdHost('sub.ads.evil.com')).toBe(true);
  });

  it('resolves hosts override', () => {
    expect(resolveHostOverride('cdn.example.com')).toBe('1.2.3.4');
  });

  it('hosts override to IP keeps original Host header', async () => {
    const policy = await applyNetworkPolicy('https://cdn.example.com/v.m3u8');
    expect(policy.ok).toBe(true);
    expect(policy.url).toContain('1.2.3.4');
    expect(policy.headers?.Host).toBe('cdn.example.com');
  });

  it('DoH swap keeps original Host header', async () => {
    vi.spyOn(VodConfig, 'getHosts').mockReturnValue([]);
    setTvNetSettings({ dohEnabled: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({ Answer: [{ type: 1, data: '9.9.9.9' }] }),
      })),
    );
    const policy = await applyNetworkPolicy('https://video.example.com/v.m3u8');
    expect(policy.ok).toBe(true);
    expect(policy.url).toContain('9.9.9.9');
    expect(policy.headers?.Host).toBe('video.example.com');
  });

  it('applyNetworkPolicy rejects ads', async () => {
    const policy = await applyNetworkPolicy('https://ads.evil.com/track');
    expect(policy.ok).toBe(false);
    expect(policy.reason).toMatch(/ads/);
  });
});

describe('tv site pref merge', () => {
  beforeEach(() => {
    clearVodConfig();
  });

  it('merges searchable/changeable from pref cache', async () => {
    await loadVodConfigFromText(
      JSON.stringify({
        sites: [
          {
            key: 'a',
            name: 'A',
            type: 1,
            api: 'https://a.example/api',
            searchable: 1,
            changeable: 1,
          },
        ],
        parses: [],
      }),
    );
    seedSitePrefCache({ a: { searchable: 0, changeable: 0 } });
    const sites = getSites();
    expect(sites[0]?.searchable).toBe(0);
    expect(sites[0]?.changeable).toBe(0);
  });
});

/**
 * Vod 播放失败回退 — 对齐 FongMi VodFallbackPolicy
 * 顺序：下一线路 → 跨站搜源（searchable ∩ changeable，精确片名）
 */

import type { PlayFlag, Result, Site, Vod } from '../types';
import * as VodConfig from '../config/vod-config';
import { parsePlayFlags } from './flags';

/** 动态导入，避免与 site-api 循环依赖 */
async function siteApi() {
  return import('../site-api');
}

export type FallbackPlayOk = {
  ok: true;
  result: Result;
  siteKey: string;
  vod: Vod;
  flags: PlayFlag[];
  flagIndex: number;
  episodeIndex: number;
  note: string;
};

export type FallbackPlayFail = {
  ok: false;
  error: string;
};

export type FallbackPlayOutcome = FallbackPlayOk | FallbackPlayFail;

function matchEpisodeIndex(flag: PlayFlag, episodeName: string): number {
  const i = flag.episodes.findIndex((e) => e.name === episodeName);
  if (i >= 0) return i;
  return flag.episodes.length ? 0 : -1;
}

/** 尝试同一详情的后续线路 */
export async function tryNextFlagPlayback(opts: {
  siteKey: string;
  flags: PlayFlag[];
  flagIndex: number;
  episodeName: string;
}): Promise<FallbackPlayOutcome | null> {
  const { siteKey, flags, episodeName } = opts;
  for (let i = opts.flagIndex + 1; i < flags.length; i++) {
    const flag = flags[i]!;
    const epIdx = matchEpisodeIndex(flag, episodeName);
    if (epIdx < 0) continue;
    const ep = flag.episodes[epIdx]!;
    try {
      const { playerContent } = await siteApi();
      const result = await playerContent(siteKey, flag.flag, ep.url);
      const url = Array.isArray(result.url) ? result.url[0] : result.url;
      const urlStr = url ? String(url).trim() : '';
      const looksMedia =
        /\.(m3u8|mp4|flv|mkv|ts|mpd)(\?|$)/i.test(urlStr) ||
        /format=m3u8|type=m3u8|\/proxy\?.*do=http/i.test(urlStr);
      if (!urlStr || (result.parse === 1 && !looksMedia)) continue;
      return {
        ok: true,
        result,
        siteKey,
        vod: { vod_id: '', vod_name: '' },
        flags,
        flagIndex: i,
        episodeIndex: epIdx,
        note: `已切换线路：${flag.flag}`,
      };
    } catch (e) {
      console.warn('[tv-fallback] flag', flag.flag, e);
    }
  }
  return null;
}

function isPassSite(site: Site, currentKey: string, autoFallback: boolean): boolean {
  if (site.key === currentKey) return false;
  if (site.searchable === 0) return false;
  if (autoFallback && site.changeable === 0) return false;
  return true;
}

function nameMatches(item: Vod, keyword: string, exact: boolean): boolean {
  const n = (item.vod_name || '').trim();
  if (!n) return false;
  if (exact) return n === keyword;
  return n.includes(keyword);
}

/**
 * 跨站换源：在 changeable+searchable 站点按片名搜索，取匹配详情同名集播放
 */
export async function tryAlternateSitePlayback(opts: {
  currentSiteKey: string;
  vodName: string;
  vodId: string;
  flag: string;
  episodeName: string;
  /** 已失败的 vod_id（跨站） */
  failedIds?: Set<string>;
  exactName?: boolean;
}): Promise<FallbackPlayOutcome> {
  const {
    currentSiteKey,
    vodName,
    vodId,
    flag,
    episodeName,
    failedIds = new Set(),
    exactName = true,
  } = opts;
  failedIds.add(vodId);

  const { searchContent, detailContent, playerContent } = await siteApi();
  const candidates = VodConfig.getSites().filter((s) => isPassSite(s, currentSiteKey, true));
  for (const site of candidates) {
    try {
      const r = await searchContent(site.key, vodName, true, '1');
      const list = (r.list ?? []).filter(
        (v) =>
          !failedIds.has(v.vod_id) &&
          v.vod_id !== vodId &&
          nameMatches(v, vodName, exactName),
      );
      const hit = list[0] ?? (r.list ?? []).find((v) => nameMatches(v, vodName, false));
      if (!hit) continue;
      failedIds.add(hit.vod_id);

      const detail = await detailContent(site.key, hit.vod_id);
      const vod = detail.list?.[0];
      if (!vod) continue;
      const flags = parsePlayFlags(vod.vod_play_from, vod.vod_play_url);
      if (!flags.length) continue;

      const flagIdx = Math.max(
        0,
        flags.findIndex((f) => f.flag === flag),
      );
      const playFlag = flags[flagIdx] ?? flags[0]!;
      const epIdx = matchEpisodeIndex(playFlag, episodeName);
      if (epIdx < 0) continue;
      const ep = playFlag.episodes[epIdx]!;

      const result = await playerContent(site.key, playFlag.flag, ep.url);
      const url = Array.isArray(result.url) ? result.url[0] : result.url;
      const urlStr = url ? String(url).trim() : '';
      const looksMedia =
        /\.(m3u8|mp4|flv|mkv|ts|mpd)(\?|$)/i.test(urlStr) ||
        /format=m3u8|type=m3u8|\/proxy\?.*do=http/i.test(urlStr);
      if (!urlStr || (result.parse === 1 && !looksMedia)) continue;

      return {
        ok: true,
        result,
        siteKey: site.key,
        vod: { ...vod, siteKey: site.key, siteName: site.name },
        flags,
        flagIndex: flagIdx >= 0 ? flagIdx : 0,
        episodeIndex: epIdx,
        note: `已换源：${site.name}`,
      };
    } catch (e) {
      console.warn('[tv-fallback] site', site.key, e);
    }
  }
  return { ok: false, error: '无可用换源站点' };
}

/** 完整回退链：线路 → 跨站 */
export async function runVodPlaybackFallback(opts: {
  siteKey: string;
  vod: Vod;
  flags: PlayFlag[];
  flagIndex: number;
  episodeName: string;
  failedIds?: Set<string>;
}): Promise<FallbackPlayOutcome> {
  const line = await tryNextFlagPlayback({
    siteKey: opts.siteKey,
    flags: opts.flags,
    flagIndex: opts.flagIndex,
    episodeName: opts.episodeName,
  });
  if (line?.ok) return line;

  return tryAlternateSitePlayback({
    currentSiteKey: opts.siteKey,
    vodName: opts.vod.vod_name,
    vodId: opts.vod.vod_id,
    flag: opts.flags[opts.flagIndex]?.flag ?? '',
    episodeName: opts.episodeName,
    failedIds: opts.failedIds,
    exactName: true,
  });
}

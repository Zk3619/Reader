/**
 * 影视搜索 / 详情 / 播放 store
 */

import { createStore } from 'solid-js/store';
import * as SiteApi from '@/lib/media/tv/site-api';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import * as VodConfig from '@/lib/media/tv/config/vod-config';
import { parsePlayFlags } from '@/lib/media/tv/play/flags';
import type { PlayFlag, Result, Vod } from '@/lib/media/tv/types';
import { openTvDetail, openTvPlay, getTvHubState } from './section';
import { reportTvError, reportTvResultMsg } from '@/lib/media/tv/tv-user-error';

/** 补全配置/爬虫返回的弹幕 URL（vodName / vodIndex / vodUrl） */
function fillDanmakuTemplate(
  template: string,
  vodName: string,
  episodeName: string,
  playUrl: string,
): string {
  if (!template.trim()) return template;
  try {
    const u = new URL(template);
    const index = episodeName.match(/\d+/)?.[0] ?? episodeName;
    if (!u.searchParams.get('vodName')) u.searchParams.set('vodName', vodName);
    if (!u.searchParams.get('vodIndex')) u.searchParams.set('vodIndex', index);
    if (!u.searchParams.get('vodUrl') && playUrl) {
      u.searchParams.set('vodUrl', playUrl);
    }
    // 兼容 {name}/{index}/{url} 占位
    return u
      .toString()
      .replace(/\{name\}/gi, encodeURIComponent(vodName))
      .replace(/\{index\}/gi, encodeURIComponent(index))
      .replace(/\{url\}/gi, encodeURIComponent(playUrl));
  } catch {
    return template
      .replace(/\{name\}/gi, encodeURIComponent(vodName))
      .replace(/\{index\}/gi, encodeURIComponent(episodeName.match(/\d+/)?.[0] ?? episodeName))
      .replace(/\{url\}/gi, encodeURIComponent(playUrl));
  }
}

const [searchState, setSearchState] = createStore({
  keyword: '',
  loading: false,
  list: [] as Vod[],
  error: '',
});

const [detailState, setDetailState] = createStore({
  loading: false,
  error: '',
  vod: null as Vod | null,
  flags: [] as PlayFlag[],
  flagIndex: 0,
  episodeIndex: -1,
  playUrl: '' as string,
  playHeaders: {} as Record<string, string>,
  playDanmaku: '' as string | unknown[],
  playLoading: false,
});

type DetailCacheEntry = {
  vod: Vod;
  flags: PlayFlag[];
};

/** 同站同片详情内存缓存，避免反复进详情页都打网络 */
const DETAIL_CACHE_MAX = 48;
const detailCache = new Map<string, DetailCacheEntry>();

function detailCacheKey(siteKey: string, vodId: string): string {
  return `${siteKey}$${vodId}`;
}

function putDetailCache(key: string, entry: DetailCacheEntry): void {
  if (detailCache.has(key)) detailCache.delete(key);
  detailCache.set(key, entry);
  while (detailCache.size > DETAIL_CACHE_MAX) {
    const oldest = detailCache.keys().next().value;
    if (oldest == null) break;
    detailCache.delete(oldest);
  }
}

/** 配置重载时清空，避免旧源详情残留 */
export function clearTvDetailCache(): void {
  detailCache.clear();
}

async function resolveFlagEpisodeIndices(
  cacheKey: string,
  flags: PlayFlag[],
  preferCurrent: boolean,
): Promise<{ flagIndex: number; episodeIndex: number }> {
  if (preferCurrent && flags.length > 0) {
    const fi = Math.min(Math.max(detailState.flagIndex, 0), flags.length - 1);
    const eps = flags[fi]?.episodes ?? [];
    const cur = detailState.episodeIndex;
    const ei =
      cur >= 0 && eps.length > 0
        ? Math.min(cur, eps.length - 1)
        : cur;
    return { flagIndex: fi, episodeIndex: ei };
  }
  try {
    const hist = await TvDao.getHistory(cacheKey);
    if (hist) {
      const fi = flags.findIndex((f) => f.flag === hist.flag);
      if (fi >= 0) {
        const ei = flags[fi]?.episodes.findIndex((e) => e.name === hist.episode) ?? -1;
        return { flagIndex: fi, episodeIndex: ei >= 0 ? ei : -1 };
      }
    }
  } catch {
    /* */
  }
  return { flagIndex: 0, episodeIndex: -1 };
}

function resolveEpisodeForFlag(
  flags: PlayFlag[],
  flagIndex: number,
  preferEpisodeName?: string,
): number {
  const eps = flags[flagIndex]?.episodes ?? [];
  if (!eps.length) return -1;
  if (preferEpisodeName) {
    const ei = eps.findIndex((e) => e.name === preferEpisodeName);
    if (ei >= 0) return ei;
  }
  return -1;
}

export function getCurrentEpisodeInfo(): {
  flag: PlayFlag | undefined;
  episode: PlayFlag['episodes'][number] | undefined;
  flagIndex: number;
  episodeIndex: number;
} {
  const flagIndex = detailState.flagIndex;
  const episodeIndex = detailState.episodeIndex;
  const flag = detailState.flags[flagIndex];
  const episode = episodeIndex >= 0 ? flag?.episodes[episodeIndex] : undefined;
  return { flag, episode, flagIndex, episodeIndex };
}

export function hasPrevEpisode(): boolean {
  return detailState.episodeIndex > 0;
}

export function hasNextEpisode(): boolean {
  const flag = detailState.flags[detailState.flagIndex];
  if (!flag) return false;
  return (
    detailState.episodeIndex >= 0 &&
    detailState.episodeIndex < flag.episodes.length - 1
  );
}

export function getTvSearchState() {
  return searchState;
}

export function getTvDetailState() {
  return detailState;
}

export async function submitTvSearch(keyword: string): Promise<void> {
  const q = keyword.trim();
  setSearchState({ keyword: q, loading: true, error: '', list: [] });
  if (!q) {
    setSearchState('loading', false);
    return;
  }
  try {
    const list = await SiteApi.searchAll(q, false);
    setSearchState({ list, loading: false });
  } catch (e) {
    setSearchState({
      loading: false,
      error: reportTvError('搜索失败', e),
    });
  }
}

export async function loadTvDetail(siteKey: string, vodId: string): Promise<void> {
  openTvDetail(siteKey, vodId);
  const cacheKey = detailCacheKey(siteKey, vodId);
  const sameAsCurrent =
    !!detailState.vod &&
    detailState.vod.vod_id === vodId &&
    getTvHubState().siteKey === siteKey;

  const cached = detailCache.get(cacheKey);
  if (cached) {
    const indices = await resolveFlagEpisodeIndices(cacheKey, cached.flags, sameAsCurrent);
    setDetailState({
      vod: cached.vod,
      flags: cached.flags,
      flagIndex: indices.flagIndex,
      episodeIndex: indices.episodeIndex,
      loading: false,
      error: '',
      ...(sameAsCurrent
        ? {}
        : { playUrl: '', playHeaders: {}, playDanmaku: '', playLoading: false }),
    });
    return;
  }

  setDetailState({
    loading: true,
    error: '',
    vod: null,
    flags: [],
    flagIndex: 0,
    episodeIndex: -1,
    playUrl: '',
    playHeaders: {},
    playDanmaku: '',
    playLoading: false,
  });
  try {
    const result: Result = await SiteApi.detailContent(siteKey, vodId);
    // 用户已切到其它详情时丢弃过期响应
    if (getTvHubState().siteKey !== siteKey || getTvHubState().vodId !== vodId) return;
    const vod = result.list?.[0] ?? null;
    const flags = parsePlayFlags(vod?.vod_play_from, vod?.vod_play_url);
    const softMsg = (result.msg ?? '').trim();
    if (vod) {
      putDetailCache(cacheKey, { vod, flags });
      const indices = await resolveFlagEpisodeIndices(cacheKey, flags, false);
      setDetailState({
        vod,
        flags,
        flagIndex: indices.flagIndex,
        episodeIndex: indices.episodeIndex,
        loading: false,
        error: '',
      });
      return;
    }
    setDetailState({
      vod: null,
      flags: [],
      flagIndex: 0,
      episodeIndex: -1,
      loading: false,
      error: softMsg
        ? reportTvResultMsg('加载详情失败', softMsg)
        : '未获取到详情（豆瓣等推荐源通常无播放线路，请换站或搜索同名影片）',
    });
  } catch (e) {
    if (getTvHubState().siteKey !== siteKey || getTvHubState().vodId !== vodId) return;
    setDetailState({
      loading: false,
      error: reportTvError('加载详情失败', e),
    });
  }
}

export function selectFlag(index: number): void {
  const flags = detailState.flags;
  if (index < 0 || index >= flags.length) return;
  const prev = getCurrentEpisodeInfo().episode?.name;
  const episodeIndex = resolveEpisodeForFlag(flags, index, prev);
  setDetailState({ flagIndex: index, episodeIndex });
}

export async function selectFlagAndPlay(index: number): Promise<void> {
  selectFlag(index);
  if (detailState.episodeIndex >= 0) {
    await playCurrentEpisode();
  } else {
    clearTvDetailPlay();
  }
}

export function selectEpisode(index: number): void {
  setDetailState('episodeIndex', index);
}

export async function playAdjacentEpisode(delta: -1 | 1): Promise<void> {
  const flag = detailState.flags[detailState.flagIndex];
  if (!flag?.episodes.length) return;
  const base = detailState.episodeIndex < 0 ? (delta > 0 ? -1 : 0) : detailState.episodeIndex;
  const next = base + delta;
  if (next < 0 || next >= flag.episodes.length) return;
  selectEpisode(next);
  await playCurrentEpisode();
}

export async function playPrevEpisode(): Promise<void> {
  await playAdjacentEpisode(-1);
}

export async function playNextEpisode(): Promise<void> {
  await playAdjacentEpisode(1);
}

export function selectParse(name: string): void {
  VodConfig.setDefaultParseName(name);
}

export async function selectParseAndReplay(name: string): Promise<void> {
  selectParse(name);
  if (detailState.episodeIndex >= 0) {
    await playCurrentEpisode();
  }
}

export function clearTvDetailPlay(): void {
  setDetailState({
    playUrl: '',
    playHeaders: {},
    playDanmaku: '',
    playLoading: false,
  });
}

export async function playCurrentEpisode(): Promise<void> {
  const { siteKey } = getTvHubState();
  const flag = detailState.flags[detailState.flagIndex];
  const ep =
    detailState.episodeIndex >= 0
      ? flag?.episodes[detailState.episodeIndex]
      : undefined;
  const vod = detailState.vod;
  if (!flag || !ep || !vod || !siteKey) return;

  openTvPlay();
  void import('@/stores/tv-hub/live').then((m) => m.clearLivePlayState());
  setDetailState({ playLoading: true, playUrl: '', error: '' });
  try {
    const result = await SiteApi.playerContent(siteKey, flag.flag, ep.url);
    const url = Array.isArray(result.url) ? result.url[0] : result.url;
    const urlStr = url ? String(url).trim() : '';
    const looksMedia =
      /\.(m3u8|mp4|flv|mkv|ts|mpd)(\?|$)/i.test(urlStr) ||
      /format=m3u8|type=m3u8|\/proxy\?.*do=http/i.test(urlStr);
    const unplayable = !urlStr || (result.parse === 1 && !looksMedia);
    const danmakuRaw = result.danmaku;
    let playDanmaku: string | unknown[] = '';
    if (typeof danmakuRaw === 'string') {
      playDanmaku = fillDanmakuTemplate(danmakuRaw, vod.vod_name, ep.name, urlStr);
    } else if (Array.isArray(danmakuRaw)) {
      playDanmaku = danmakuRaw
        .map((d) => {
          const raw = typeof d === 'string' ? d : d?.url;
          return typeof raw === 'string'
            ? fillDanmakuTemplate(raw, vod.vod_name, ep.name, urlStr)
            : raw;
        })
        .filter(Boolean) as string[];
      if (playDanmaku.length === 1) playDanmaku = playDanmaku[0] as string;
    }
    const histKey = `${siteKey}$${vod.vod_id}`;
    const prevHist = await TvDao.getHistory(histKey);
    const sameEpisode =
      !!prevHist && prevHist.flag === flag.flag && prevHist.episode === ep.name;
    // 换集清零进度；同集续播保留，避免与播放器 seek 竞态把进度冲掉
    await TvDao.upsertHistory({
      key: histKey,
      siteKey,
      vodId: vod.vod_id,
      vodName: vod.vod_name,
      vodPic: vod.vod_pic ?? '',
      flag: flag.flag,
      episode: ep.name,
      position: sameEpisode ? prevHist.position : 0,
      duration: sameEpisode ? prevHist.duration : 0,
      updatedAt: Date.now(),
      cid: 0,
    });
    setDetailState({
      playUrl: unplayable ? '' : urlStr,
      playHeaders: result.header ?? {},
      playDanmaku,
      playLoading: false,
      error: unplayable
        ? String(result.msg || '未能解析到可播放地址')
        : '',
    });
  } catch (e) {
    // 失败尝试换源
    try {
      const alt = await SiteApi.playWithAlternateSite(
        siteKey,
        vod.vod_name,
        flag.flag,
        ep.url,
      );
      const url = Array.isArray(alt.url) ? alt.url[0] : alt.url;
      const urlStr = url ? String(url).trim() : '';
      const looksMedia =
        /\.(m3u8|mp4|flv|mkv|ts|mpd)(\?|$)/i.test(urlStr) ||
        /format=m3u8|type=m3u8|\/proxy\?.*do=http/i.test(urlStr);
      const unplayable = !urlStr || (alt.parse === 1 && !looksMedia);
      const histKey = `${siteKey}$${vod.vod_id}`;
      const prevHist = await TvDao.getHistory(histKey);
      const sameEpisode =
        !!prevHist && prevHist.flag === flag.flag && prevHist.episode === ep.name;
      await TvDao.upsertHistory({
        key: histKey,
        siteKey,
        vodId: vod.vod_id,
        vodName: vod.vod_name,
        vodPic: vod.vod_pic ?? '',
        flag: flag.flag,
        episode: ep.name,
        position: sameEpisode ? prevHist.position : 0,
        duration: sameEpisode ? prevHist.duration : 0,
        updatedAt: Date.now(),
        cid: 0,
      });
      setDetailState({
        playUrl: unplayable ? '' : urlStr,
        playHeaders: alt.header ?? {},
        playLoading: false,
        error: unplayable ? String(alt.msg || '未能解析到可播放地址') : '',
      });
    } catch {
      setDetailState({
        playLoading: false,
        error: reportTvError('播放失败', e),
      });
    }
  }
}

export async function switchSourceAndPlay(): Promise<void> {
  const { siteKey } = getTvHubState();
  const flag = detailState.flags[detailState.flagIndex];
  const ep = flag?.episodes[detailState.episodeIndex];
  const vod = detailState.vod;
  if (!flag || !ep || !vod || !siteKey) return;
  openTvPlay();
  void import('@/stores/tv-hub/live').then((m) => m.clearLivePlayState());
  setDetailState({ playLoading: true, error: '' });
  try {
    const alt = await SiteApi.playWithAlternateSite(
      siteKey,
      vod.vod_name,
      flag.flag,
      ep.url,
    );
    const url = Array.isArray(alt.url) ? alt.url[0] : alt.url;
    const urlStr = url ? String(url).trim() : '';
    const looksMedia =
      /\.(m3u8|mp4|flv|mkv|ts|mpd)(\?|$)/i.test(urlStr) ||
      /format=m3u8|type=m3u8|\/proxy\?.*do=http/i.test(urlStr);
    const unplayable = !urlStr || (alt.parse === 1 && !looksMedia);
    setDetailState({
      playUrl: unplayable ? '' : urlStr,
      playHeaders: alt.header ?? {},
      playLoading: false,
      error: unplayable ? String(alt.msg || '未能解析到可播放地址') : '',
    });
  } catch (e) {
    setDetailState({
      playLoading: false,
      error: reportTvError('换源播放失败', e),
    });
  }
}

export async function toggleKeepCurrent(): Promise<void> {
  const { siteKey } = getTvHubState();
  const vod = detailState.vod;
  if (!vod || !siteKey) return;
  const key = `${siteKey}$${vod.vod_id}`;
  const existing = (await TvDao.listKeep()).find((k) => k.key === key);
  if (existing) {
    await TvDao.removeKeep(key);
    return;
  }
  await TvDao.upsertKeep({
    key,
    siteKey,
    vodId: vod.vod_id,
    vodName: vod.vod_name,
    vodPic: vod.vod_pic ?? '',
    kind: 'vod',
    cid: 0,
    createdAt: Date.now(),
  });
}

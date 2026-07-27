/**
 * 影视搜索 / 详情 / 播放 store
 */

import { createStore } from 'solid-js/store';
import * as SiteApi from '@/lib/media/tv/site-api';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import * as VodConfig from '@/lib/media/tv/config/vod-config';
import { parsePlayFlags } from '@/lib/media/tv/play/flags';
import type { PlayFlag, Result, Sub, Vod } from '@/lib/media/tv/types';
import {
  parsePlayQualities,
  pickPlayUrl,
  defaultQualityIndex,
  type PlayQuality,
} from '@/lib/media/tv/play/parse-play-qualities';
import { openTvDetail, openTvPlay, getTvHubState, setTvDetailContext } from './section';
import { reportTvError, reportTvResultMsg, isTvTechnicalError } from '@/lib/media/tv/tv-user-error';

import { fillDanmakuTemplate } from '@/lib/media/tv/play/danmaku-url';
export type TvSearchMatchMode = 'normal' | 'exact' | 'fuzzy';

const [searchState, setSearchState] = createStore({
  keyword: '',
  loading: false,
  /** 接口原始结果 */
  rawList: [] as Vod[],
  /** 按 matchMode 过滤后的展示列表 */
  list: [] as Vod[],
  /** 常规：不过滤；精确：片名包含关键词；模糊：关键词字符按序出现在片名中 */
  matchMode: 'normal' as TvSearchMatchMode,
  error: '',
});

export function filterTvSearchList(
  list: Vod[],
  keyword: string,
  mode: TvSearchMatchMode,
): Vod[] {
  const q = keyword.trim().toLowerCase();
  if (!q || mode === 'normal') return list;
  return list.filter((v) => {
    const name = (v.vod_name ?? '').trim().toLowerCase();
    if (!name) return false;
    if (mode === 'exact') return name.includes(q);
    // 模糊：关键词每个字符按顺序出现（允许间隔），过滤只命中单字的噪声
    let i = 0;
    for (const ch of name) {
      if (ch === q[i]) {
        i += 1;
        if (i >= q.length) return true;
      }
    }
    return false;
  });
}

export function getTvSearchState() {
  return searchState;
}

export function setTvSearchMatchMode(mode: TvSearchMatchMode): void {
  if (searchState.matchMode === mode) return;
  setSearchState({
    matchMode: mode,
    list: filterTvSearchList(searchState.rawList, searchState.keyword, mode),
  });
}

export function setTvSearchKeyword(keyword: string): void {
  setSearchState('keyword', keyword);
}

export async function submitTvSearch(keyword?: string): Promise<void> {
  const q = (keyword ?? searchState.keyword).trim();
  setSearchState({ keyword: q, loading: true, error: '', list: [], rawList: [] });
  if (!q) {
    setSearchState('loading', false);
    return;
  }
  try {
    const raw = await SiteApi.searchAll(q, false);
    const mode = searchState.matchMode;
    setSearchState({
      rawList: raw,
      list: filterTvSearchList(raw, q, mode),
      loading: false,
    });
  } catch (e) {
    setSearchState({
      loading: false,
      error: reportTvError('搜索失败', e),
    });
  }
}

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
  playSubtitleUrl: '' as string,
  playSubtitleType: 'vtt' as 'vtt' | 'srt' | 'ass',
  /** 源返回的全部字幕轨 */
  playSubtitles: [] as Sub[],
  /** 多画质列表（仅一项时不展示切换） */
  playQualities: [] as PlayQuality[],
  playQualityIndex: 0,
  playDrm: null as { key?: string; type?: string } | null,
  playLoading: false,
  /** 直达播放（本地库等）起始秒；0 表示不强制 */
  playStartSec: 0,
  /** 本地文件绝对路径（Artplayer 用；用于 asset 作用域放行 / 刷新） */
  playLocalPath: '' as string,
  /** 当前选中的解析器名（UI 高亮；与 VodConfig 默认解析同步） */
  parseName: '' as string,
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

function syncParseNameFromConfig(): string {
  const name = VodConfig.getDefaultParseName();
  setDetailState({ parseName: name });
  return name;
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

export function getTvDetailState() {
  return detailState;
}

/**
 * 外部播放会话（番剧规则等非 VOD 站点）：复用播放页的线路/选集 UI，
 * 但由外部提供解析器（选集后自行抽流并回写 playUrl）。
 */
export type TvPlaySessionResolver = (args: {
  flagIndex: number;
  episodeIndex: number;
}) => Promise<void>;

let playSessionResolver: TvPlaySessionResolver | null = null;

export function setTvPlaySessionResolver(fn: TvPlaySessionResolver | null): void {
  playSessionResolver = fn;
}

/** 进入播放页占位：先显示片名 +「正在获取播放链接」，便于沉浸顶栏立刻挂上 */
export function enterTvPlayLoadingShell(opts: {
  siteKey: string;
  vod: Vod;
}): void {
  playSessionResolver = null;
  void import('@/stores/tv-hub/live').then((m) => m.clearLivePlayState());
  setTvDetailContext(opts.siteKey, opts.vod.vod_id);
  setDetailState({
    loading: false,
    error: '',
    vod: opts.vod,
    flags: [],
    flagIndex: 0,
    episodeIndex: -1,
    playUrl: '',
    playHeaders: {},
    playDanmaku: '',
    playSubtitleUrl: '',
    playSubtitleType: 'vtt',
    playSubtitles: [],
    playQualities: [],
    playQualityIndex: 0,
    playDrm: null,
    playLoading: true,
    playStartSec: 0,
    playLocalPath: '',
  });
  syncParseNameFromConfig();
  openTvPlay();
}

/** 进入播放页并置「解析中」，选集能力由传入的 flags 提供 */
export function beginTvPlaySession(opts: {
  vod: Vod;
  flags: PlayFlag[];
  flagIndex?: number;
  episodeIndex?: number;
  resolver: TvPlaySessionResolver;
}): void {
  playSessionResolver = opts.resolver;
  void import('@/stores/tv-hub/live').then((m) => m.clearLivePlayState());
  setDetailState({
    loading: false,
    error: '',
    vod: opts.vod,
    flags: opts.flags,
    flagIndex: opts.flagIndex ?? 0,
    episodeIndex: opts.episodeIndex ?? -1,
    playUrl: '',
    playHeaders: {},
    playDanmaku: '',
    playSubtitleUrl: '',
    playSubtitleType: 'vtt',
    playSubtitles: [],
    playQualities: [],
    playQualityIndex: 0,
    playDrm: null,
    playLoading: true,
    playStartSec: 0,
    playLocalPath: '',
  });
  syncParseNameFromConfig();
  openTvPlay();
}

/** 会话内换集：清空旧地址并回到「解析中」 */
export function setTvPlaySessionLoading(): void {
  setDetailState({ playLoading: true, playUrl: '', error: '' });
}

export function applyTvPlaySessionUrl(opts: {
  url: string;
  headers?: Record<string, string>;
  danmaku?: string | unknown[];
  startSec?: number;
}): void {
  setDetailState({
    playUrl: opts.url.trim(),
    playHeaders: opts.headers ?? {},
    playDanmaku: opts.danmaku ?? '',
    playLoading: false,
    playStartSec:
      opts.startSec != null && Number.isFinite(opts.startSec) && opts.startSec > 0
        ? opts.startSec
        : 0,
    error: '',
  });
}

export function failTvPlaySession(error: string): void {
  setDetailState({ playLoading: false, playUrl: '', error });
}

/** 本地库 / 强制 artplayer：写入 playUrl 并进入 Hub 播放页 */
export async function openDirectArtplayerPlay(opts: {
  url: string;
  title?: string;
  startSec?: number;
  /** 原始本地绝对路径（未 convertFileSrc） */
  localPath?: string;
}): Promise<void> {
  const playUrl = (opts.url || '').trim();
  if (!playUrl) throw new Error('无播放地址');
  playSessionResolver = null;
  void import('@/stores/tv-hub/live').then((m) => m.clearLivePlayState());
  const title = (opts.title || '').trim() || '本地视频';
  const startSec =
    opts.startSec != null && Number.isFinite(opts.startSec) && opts.startSec > 0
      ? opts.startSec
      : 0;
  setDetailState({
    loading: false,
    error: '',
    vod: {
      vod_id: `local:${title}`,
      vod_name: title,
      siteKey: 'local',
    },
    flags: [],
    flagIndex: 0,
    episodeIndex: -1,
    playUrl,
    playHeaders: {},
    playDanmaku: '',
    playSubtitleUrl: '',
    playSubtitleType: 'vtt',
    playSubtitles: [],
    playQualities: [],
    playQualityIndex: 0,
    playDrm: null,
    playLoading: false,
    playStartSec: startSec,
    playLocalPath: (opts.localPath || '').trim(),
  });
  openTvPlay();
}

/**
 * 对齐 FongMi TypeFragment.onItemClick：
 * vod.action 非空 → SiteApi.action + Toast(msg)；否则进详情。
 */
export async function openTvVod(vod: Vod, siteKeyFallback = ''): Promise<void> {
  const siteKey = (vod.siteKey || siteKeyFallback || '').trim();
  const action = (vod.action ?? '').trim();
  if (!action) {
    if (!siteKey || !vod.vod_id) return;
    await loadTvDetail(siteKey, vod.vod_id);
    return;
  }
  if (!siteKey) {
    reportTvError('站点操作失败', '缺少站点 key');
    return;
  }
  try {
    const result = await SiteApi.siteAction(siteKey, action);
    const msg = (result.msg ?? '').trim();
    if (msg) {
      if (isTvTechnicalError(msg)) {
        reportTvError('站点操作', msg);
      } else {
        void import('@/components/shared/AppToasts').then(({ showAppToast }) => {
          showAppToast({
            title: vod.vod_name?.trim() || '站点操作',
            description: msg,
            variant: 'default',
          });
        });
      }
    }
    const urlRaw = result.url;
    const url =
      typeof urlRaw === 'string'
        ? urlRaw.trim()
        : Array.isArray(urlRaw)
          ? String(urlRaw[0] ?? '').trim()
          : '';
    if (/^https?:\/\//i.test(url)) {
      const { openUrlInApp } = await import('@/lib/platform/open-url');
      await openUrlInApp(url, vod.vod_name?.trim() || '登录');
    }
  } catch (e) {
    reportTvError('站点操作失败', e);
  }
}

export async function loadTvDetail(
  siteKey: string,
  vodId: string,
  opts?: {
    /**
     * 默认 true：进入详情页。
     * false：只写入 siteKey/vodId 并加载线路，不切分区（历史/收藏「立即播放」用）。
     */
    navigate?: boolean;
    /**
     * 已在播放页占位加载时：保留 vod 占位与 playLoading，避免闪断叠层顶栏。
     */
    retainPlayShell?: boolean;
  },
): Promise<void> {
  playSessionResolver = null;
  const resolvedSiteKey = VodConfig.resolveSiteKey(siteKey) || siteKey.trim();
  if (opts?.navigate === false) {
    setTvDetailContext(resolvedSiteKey, vodId);
  } else {
    openTvDetail(resolvedSiteKey, vodId);
  }
  const retainPlayShell = opts?.retainPlayShell === true;
  const cacheKey = detailCacheKey(resolvedSiteKey, vodId);
  const sameAsCurrent =
    !!detailState.vod &&
    detailState.vod.vod_id === vodId &&
    getTvHubState().siteKey === resolvedSiteKey;

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
        : {
            playUrl: '',
            playHeaders: {},
            playDanmaku: '',
            playLoading: retainPlayShell,
          }),
      ...(retainPlayShell ? { playLoading: true } : {}),
    });
    syncParseNameFromConfig();
    return;
  }

  setDetailState({
    loading: true,
    error: '',
    ...(retainPlayShell
      ? {
          // 保留占位片名，便于顶栏/叠层立刻有标题
          playLoading: true,
          playUrl: '',
          playHeaders: {},
          playDanmaku: '',
        }
      : {
          vod: null,
          flags: [],
          flagIndex: 0,
          episodeIndex: -1,
          playUrl: '',
          playHeaders: {},
          playDanmaku: '',
          playLoading: false,
        }),
  });
  try {
    const result: Result = await SiteApi.detailContent(resolvedSiteKey, vodId);
    // 用户已切到其它详情时丢弃过期响应
    if (getTvHubState().siteKey !== resolvedSiteKey || getTvHubState().vodId !== vodId) return;
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
        ...(retainPlayShell ? { playLoading: true, playUrl: '' } : {}),
      });
      syncParseNameFromConfig();
      return;
    }
    setDetailState({
      vod: retainPlayShell ? detailState.vod : null,
      flags: [],
      flagIndex: 0,
      episodeIndex: -1,
      loading: false,
      playLoading: false,
      error: softMsg
        ? reportTvResultMsg('加载详情失败', softMsg)
        : '未获取到详情（豆瓣等推荐源通常无播放线路，请换站或搜索同名影片）',
    });
    syncParseNameFromConfig();
  } catch (e) {
    if (getTvHubState().siteKey !== resolvedSiteKey || getTvHubState().vodId !== vodId) return;
    setDetailState({
      loading: false,
      playLoading: false,
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
  setDetailState({ parseName: name });
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
    playSubtitleUrl: '',
    playSubtitleType: 'vtt',
    playSubtitles: [],
    playQualities: [],
    playQualityIndex: 0,
    playDrm: null,
    playLoading: false,
    playStartSec: 0,
    playLocalPath: '',
  });
}

export function setPlaySubtitleFromPath(pathOrUrl: string): void {
  const raw = pathOrUrl.trim();
  if (!raw) return;
  let type: 'vtt' | 'srt' | 'ass' = 'vtt';
  const lower = raw.toLowerCase();
  if (lower.endsWith('.ass') || lower.endsWith('.ssa')) type = 'ass';
  else if (lower.endsWith('.srt')) type = 'srt';
  const url = /^https?:\/\//i.test(raw) || raw.startsWith('file:')
    ? raw
    : `file://${raw.replace(/\\/g, '/')}`;
  setDetailState({
    playSubtitleUrl: url,
    playSubtitleType: type,
    playSubtitles: [{ name: '本地字幕', url, format: type }],
  });
}

/** 切换多画质（不重走 spider，仅换直链） */
export function selectPlayQuality(index: number): string | null {
  const list = detailState.playQualities;
  if (!list.length) return null;
  const i = Math.min(Math.max(index, 0), list.length - 1);
  const url = list[i]?.url?.trim() ?? '';
  if (!url) return null;
  setDetailState({ playQualityIndex: i, playUrl: url });
  return url;
}

export function selectPlaySubtitle(url: string | null, type?: 'vtt' | 'srt' | 'ass'): void {
  if (!url?.trim()) {
    setDetailState({ playSubtitleUrl: '', playSubtitleType: 'vtt' });
    return;
  }
  const raw = url.trim();
  let t: 'vtt' | 'srt' | 'ass' = type ?? 'vtt';
  if (!type) {
    const lower = raw.toLowerCase();
    if (lower.endsWith('.ass') || lower.endsWith('.ssa')) t = 'ass';
    else if (lower.endsWith('.srt')) t = 'srt';
  }
  const exists = detailState.playSubtitles.some((s) => s.url?.trim() === raw);
  setDetailState({
    playSubtitleUrl: raw,
    playSubtitleType: t,
    ...(exists
      ? {}
      : {
          playSubtitles: [
            ...detailState.playSubtitles,
            { name: '当前字幕', url: raw, format: t },
          ],
        }),
  });
}

export function setPlayDanmakuFromUrl(url: string): void {
  if (!url.trim()) return;
  setDetailState({ playDanmaku: url.trim() });
}

function pickSubtitle(result: Result): { url: string; type: 'vtt' | 'srt' | 'ass' } {
  const sub = result.sub?.find((s) => s.url?.trim()) ?? result.sub?.[0];
  const url = sub?.url?.trim() ?? '';
  const fmt = (sub?.format || '').toLowerCase();
  let type: 'vtt' | 'srt' | 'ass' = 'vtt';
  if (fmt.includes('ass') || fmt.includes('ssa') || url.endsWith('.ass') || url.endsWith('.ssa')) {
    type = 'ass';
  } else if (fmt.includes('srt') || url.endsWith('.srt')) {
    type = 'srt';
  }
  return { url, type };
}

function isPlayableResult(result: Result): boolean {
  const url = pickPlayUrl(result.url, 0);
  const urlStr = url ? String(url).trim() : '';
  const looksMedia =
    /\.(m3u8|mp4|flv|mkv|ts|mpd)(\?|$)/i.test(urlStr) ||
    /format=m3u8|type=m3u8|\/proxy\?.*do=http/i.test(urlStr);
  return !!urlStr && !(result.parse === 1 && !looksMedia);
}

async function applyPlayResult(opts: {
  siteKey: string;
  vod: Vod;
  flag: string;
  episodeName: string;
  result: Result;
  flagIndex?: number;
  episodeIndex?: number;
  flags?: PlayFlag[];
  note?: string;
}): Promise<boolean> {
  const { siteKey, vod, flag, episodeName, result } = opts;
  if (opts.flags) {
    setDetailState({
      vod,
      flags: opts.flags,
      flagIndex: opts.flagIndex ?? 0,
      episodeIndex: opts.episodeIndex ?? 0,
    });
  } else if (opts.flagIndex != null || opts.episodeIndex != null) {
    setDetailState({
      ...(opts.flagIndex != null ? { flagIndex: opts.flagIndex } : {}),
      ...(opts.episodeIndex != null ? { episodeIndex: opts.episodeIndex } : {}),
    });
  }

  const qualities = parsePlayQualities(result.url);
  const qIndex = Math.min(defaultQualityIndex(result.url), Math.max(qualities.length - 1, 0));
  const urlStr = (
    qualities[qIndex]?.url ||
    pickPlayUrl(result.url, qIndex) ||
    ''
  ).trim();
  const playable = isPlayableResult(result);
  const danmakuRaw = result.danmaku;
  let playDanmaku: string | unknown[] = '';
  if (typeof danmakuRaw === 'string') {
    playDanmaku = fillDanmakuTemplate(danmakuRaw, vod.vod_name, episodeName, urlStr);
  } else if (Array.isArray(danmakuRaw)) {
    playDanmaku = danmakuRaw
      .map((d) => {
        const raw = typeof d === 'string' ? d : d?.url;
        return typeof raw === 'string'
          ? fillDanmakuTemplate(raw, vod.vod_name, episodeName, urlStr)
          : raw;
      })
      .filter(Boolean) as string[];
    if (playDanmaku.length === 1) playDanmaku = playDanmaku[0] as string;
  }
  const sub = pickSubtitle(result);
  const subs = Array.isArray(result.sub)
    ? result.sub.filter((s) => !!s?.url?.trim())
    : [];
  const histKey = `${siteKey}$${vod.vod_id}`;
  const prevHist = await TvDao.getHistory(histKey);
  const sameEpisode =
    !!prevHist && prevHist.flag === flag && prevHist.episode === episodeName;
  await TvDao.upsertHistory({
    key: histKey,
    siteKey,
    vodId: vod.vod_id,
    vodName: vod.vod_name,
    vodPic: vod.vod_pic ?? '',
    flag,
    episode: episodeName,
    position: sameEpisode ? prevHist.position : 0,
    duration: sameEpisode ? prevHist.duration : 0,
    updatedAt: Date.now(),
    cid: 0,
  });
  setDetailState({
    playUrl: playable ? urlStr : '',
    playHeaders: result.header ?? {},
    playDanmaku,
    playSubtitleUrl: sub.url,
    playSubtitleType: sub.type,
    playSubtitles: subs,
    playQualities: qualities,
    playQualityIndex: qualities.length ? qIndex : 0,
    playDrm: result.drm ?? null,
    playLoading: false,
    error: playable ? '' : String(result.msg || '未能解析到可播放地址'),
  });
  if (playable && opts.note) {
    console.info('[tv-play]', opts.note);
  }
  return playable;
}

export async function playCurrentEpisode(): Promise<void> {
  if (playSessionResolver) {
    await playSessionResolver({
      flagIndex: detailState.flagIndex,
      episodeIndex: detailState.episodeIndex,
    });
    return;
  }
  const { siteKey } = getTvHubState();
  const flag = detailState.flags[detailState.flagIndex];
  const ep =
    detailState.episodeIndex >= 0
      ? flag?.episodes[detailState.episodeIndex]
      : undefined;
  const vod = detailState.vod;
  if (!flag || !ep || !vod || !siteKey) return;

  const { shouldDivertHubFromArtplayer } = await import(
    '@/lib/media/video/playback/prefs'
  );
  const { openRoutedPlayback } = await import(
    '@/lib/media/video/playback/open-routed'
  );
  const divert = shouldDivertHubFromArtplayer();

  if (!divert) {
    openTvPlay();
    void import('@/stores/tv-hub/live').then((m) => m.clearLivePlayState());
  }
  setDetailState({ playLoading: true, playUrl: '', error: '' });
  try {
    const result = await SiteApi.playerContent(siteKey, flag.flag, ep.url);
    if (
      await applyPlayResult({
        siteKey,
        vod,
        flag: flag.flag,
        episodeName: ep.name,
        result,
      })
    ) {
      if (divert) {
        const url = detailState.playUrl;
        try {
          const engine = await openRoutedPlayback(url, {
            title: vod.vod_name,
            sourceKind: 'hub_stream',
            headers: detailState.playHeaders,
          });
          setDetailState({ playLoading: false });
          const { showAppToast } = await import('@/components/shared/AppToasts');
          const { formatPlaybackToastDescription } = await import(
            '@/lib/media/video/playback/mpv-launch'
          );
          showAppToast({
            title: '已按强制引擎播放',
            description: formatPlaybackToastDescription(engine, vod.vod_name),
          });
        } catch (e) {
          setDetailState({
            playLoading: false,
            error: reportTvError('强制引擎播放失败', e),
          });
        }
      }
      return;
    }
    throw new Error(result.msg || '未能解析到可播放地址');
  } catch (e) {
    try {
      const { runVodPlaybackFallback } = await import(
        '@/lib/media/tv/play/vod-fallback-policy'
      );
      const { isTvAutoSwitchFlagOnError } = await import('@/stores/tv-hub/tv-play-ui');
      const outcome = await runVodPlaybackFallback({
        siteKey,
        vod,
        flags: detailState.flags,
        flagIndex: detailState.flagIndex,
        episodeName: ep.name,
        tryNextFlag: isTvAutoSwitchFlagOnError(),
      });
      if (!outcome.ok) throw new Error(outcome.error);
      if (outcome.siteKey !== siteKey || outcome.vod.vod_id) {
        openTvDetail(outcome.siteKey, outcome.vod.vod_id || vod.vod_id);
      }
      const playFlag = outcome.flags[outcome.flagIndex];
      const playEp = playFlag?.episodes[outcome.episodeIndex];
      await applyPlayResult({
        siteKey: outcome.siteKey,
        vod: outcome.vod.vod_id ? outcome.vod : vod,
        flag: playFlag?.flag ?? flag.flag,
        episodeName: playEp?.name ?? ep.name,
        result: outcome.result,
        flags: outcome.flags.length ? outcome.flags : undefined,
        flagIndex: outcome.flagIndex,
        episodeIndex: outcome.episodeIndex,
        note: outcome.note,
      });
      if (divert && detailState.playUrl) {
        try {
          const engine = await openRoutedPlayback(detailState.playUrl, {
            title: (outcome.vod.vod_id ? outcome.vod : vod).vod_name,
            sourceKind: 'hub_stream',
            headers: detailState.playHeaders,
          });
          setDetailState({ playLoading: false });
          const { showAppToast } = await import('@/components/shared/AppToasts');
          const { formatPlaybackToastDescription } = await import(
            '@/lib/media/video/playback/mpv-launch'
          );
          showAppToast({
            title: '已按强制引擎播放',
            description: formatPlaybackToastDescription(
              engine,
              (outcome.vod.vod_id ? outcome.vod : vod).vod_name,
            ),
          });
        } catch (fe) {
          setDetailState({
            playLoading: false,
            error: reportTvError('强制引擎播放失败', fe),
          });
        }
      }
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
    const { tryAlternateSitePlayback } = await import(
      '@/lib/media/tv/play/vod-fallback-policy'
    );
    const outcome = await tryAlternateSitePlayback({
      currentSiteKey: siteKey,
      vodName: vod.vod_name,
      vodId: vod.vod_id,
      flag: flag.flag,
      episodeName: ep.name,
      exactName: true,
    });
    if (!outcome.ok) throw new Error(outcome.error);
    openTvDetail(outcome.siteKey, outcome.vod.vod_id);
    const playFlag = outcome.flags[outcome.flagIndex];
    const playEp = playFlag?.episodes[outcome.episodeIndex];
    await applyPlayResult({
      siteKey: outcome.siteKey,
      vod: outcome.vod,
      flag: playFlag?.flag ?? flag.flag,
      episodeName: playEp?.name ?? ep.name,
      result: outcome.result,
      flags: outcome.flags,
      flagIndex: outcome.flagIndex,
      episodeIndex: outcome.episodeIndex,
      note: outcome.note,
    });
  } catch (e) {
    setDetailState({
      playLoading: false,
      error: reportTvError('换源播放失败', e),
    });
  }
}

/** 播放器 error 事件触发的回退（线路 → 跨站） */
export async function fallbackOnPlaybackError(): Promise<void> {
  // 外部会话（番剧规则）没有 VOD 站点回退链路，交由其自身重试
  if (playSessionResolver) return;
  const { siteKey } = getTvHubState();
  const flag = detailState.flags[detailState.flagIndex];
  const ep = flag?.episodes[detailState.episodeIndex];
  const vod = detailState.vod;
  if (!flag || !ep || !vod || !siteKey || detailState.playLoading) return;
  setDetailState({ playLoading: true, error: '' });
  try {
    const { runVodPlaybackFallback } = await import(
      '@/lib/media/tv/play/vod-fallback-policy'
    );
    const { isTvAutoSwitchFlagOnError } = await import('@/stores/tv-hub/tv-play-ui');
    const outcome = await runVodPlaybackFallback({
      siteKey,
      vod,
      flags: detailState.flags,
      flagIndex: detailState.flagIndex,
      episodeName: ep.name,
      tryNextFlag: isTvAutoSwitchFlagOnError(),
    });
    if (!outcome.ok) {
      setDetailState({ playLoading: false, error: outcome.error });
      return;
    }
    if (outcome.vod.vod_id) {
      openTvDetail(outcome.siteKey, outcome.vod.vod_id);
    }
    const playFlag = outcome.flags[outcome.flagIndex];
    const playEp = playFlag?.episodes[outcome.episodeIndex];
    await applyPlayResult({
      siteKey: outcome.siteKey,
      vod: outcome.vod.vod_id ? outcome.vod : vod,
      flag: playFlag?.flag ?? flag.flag,
      episodeName: playEp?.name ?? ep.name,
      result: outcome.result,
      flags: outcome.flags.length ? outcome.flags : undefined,
      flagIndex: outcome.flagIndex,
      episodeIndex: outcome.episodeIndex,
      note: outcome.note,
    });
  } catch (e) {
    setDetailState({
      playLoading: false,
      error: reportTvError('自动换源失败', e),
    });
  }
}

export async function toggleKeepCurrent(): Promise<boolean> {
  const { siteKey } = getTvHubState();
  const vod = detailState.vod;
  if (!vod || !siteKey) return false;
  const key = `${siteKey}$${vod.vod_id}`;
  const existing = (await TvDao.listKeep()).find((k) => k.key === key);
  if (existing) {
    await TvDao.removeKeep(key);
    return false;
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
  return true;
}

export async function isCurrentVodKept(): Promise<boolean> {
  const { siteKey } = getTvHubState();
  const vod = detailState.vod;
  if (!vod || !siteKey) return false;
  const key = `${siteKey}$${vod.vod_id}`;
  return !!(await TvDao.listKeep()).find((k) => k.key === key);
}

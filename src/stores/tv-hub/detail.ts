/**
 * 影视搜索 / 详情 / 播放 store
 */

import { createStore } from 'solid-js/store';
import * as SiteApi from '@/lib/media/tv/site-api';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
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
  episodeIndex: 0,
  playUrl: '' as string,
  playHeaders: {} as Record<string, string>,
  playDanmaku: '' as string | unknown[],
  playLoading: false,
});

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
  setDetailState({ loading: true, error: '', vod: null, flags: [], playUrl: '' });
  try {
    const result: Result = await SiteApi.detailContent(siteKey, vodId);
    const vod = result.list?.[0] ?? null;
    const flags = parsePlayFlags(vod?.vod_play_from, vod?.vod_play_url);
    const softMsg = (result.msg ?? '').trim();
    setDetailState({
      vod,
      flags,
      flagIndex: 0,
      episodeIndex: 0,
      loading: false,
      error: !vod
        ? softMsg
          ? reportTvResultMsg('加载详情失败', softMsg)
          : '未获取到详情（豆瓣等推荐源通常无播放线路，请换站或搜索同名影片）'
        : '',
    });
  } catch (e) {
    setDetailState({
      loading: false,
      error: reportTvError('加载详情失败', e),
    });
  }
}

export function selectFlag(index: number): void {
  setDetailState({ flagIndex: index, episodeIndex: 0 });
}

export function selectEpisode(index: number): void {
  setDetailState('episodeIndex', index);
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
  const ep = flag?.episodes[detailState.episodeIndex];
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
    setDetailState({
      playUrl: unplayable ? '' : urlStr,
      playHeaders: result.header ?? {},
      playDanmaku,
      playLoading: false,
      error: unplayable
        ? String(result.msg || '未能解析到可播放地址')
        : '',
    });
    await TvDao.upsertHistory({
      key: `${siteKey}$${vod.vod_id}`,
      siteKey,
      vodId: vod.vod_id,
      vodName: vod.vod_name,
      vodPic: vod.vod_pic ?? '',
      flag: flag.flag,
      episode: ep.name,
      position: 0,
      duration: 0,
      updatedAt: Date.now(),
      cid: 0,
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

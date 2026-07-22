/**
 * 影视直播 store（对齐 TV-fongmi LiveConfig / LiveApi / LivePlayback 子集）
 */

import { createStore } from 'solid-js/store';
import * as LiveApi from '@/lib/media/tv/live-api';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import type { LiveChannel, LiveGroup, LiveSource } from '@/lib/media/tv/types';
import {
  currentProgramme,
  formatProgramme,
  loadBulkEpg,
  loadChannelEpg,
  mergeEpgProgrammes,
  pickEpgApiTemplate,
  programmesForChannel,
  type EpgProgramme,
} from '@/lib/media/tv/live/epg';
import {
  catchupFromChannelAttrs,
  formatCatchupUrl,
} from '@/lib/media/tv/live/catchup';
import {
  buildLivePlayHeaders,
  resolveLivePlayUrl,
} from '@/lib/media/tv/live/parser';
import { setTvSection } from '@/stores/tv-hub/section';
import { formatTvUserError, reportTvError } from '@/lib/media/tv/tv-user-error';
import {
  decodeLiveKeep,
  encodeLiveKeep,
  getTvLiveUi,
  setTvLiveHomeSourceName,
  setTvLiveLastKeep,
} from '@/stores/tv-hub/tv-live-ui';

export const TV_LIVE_KEEP_GROUP = '收藏';

export type LiveChannelRef = LiveChannel & { group: string };

export interface LivePlayState {
  url: string;
  name: string;
  epgText: string;
  /** 当前线路索引 */
  lineIndex: number;
  sourceName: string;
  groupName: string;
  channelName: string;
  urls: string[];
  /** 播放请求头（源级 + 频道级 + 行内 |UA） */
  headers: Record<string, string>;
}

const [livePlay, setLivePlay] = createStore<LivePlayState>({
  url: '',
  name: '',
  epgText: '',
  lineIndex: 0,
  sourceName: '',
  groupName: '',
  channelName: '',
  urls: [],
  headers: {},
});

export function getLivePlayState(): LivePlayState {
  return livePlay;
}

export function setLivePlayState(
  partial: Partial<LivePlayState>,
): void {
  setLivePlay(partial);
}

const [liveState, setLiveState] = createStore({
  loading: false,
  error: '' as string,
  sources: [] as LiveSource[],
  sourceName: '' as string,
  groups: [] as LiveGroup[],
  channels: [] as LiveChannelRef[],
  groupName: '' as string,
  channelName: '' as string,
  lineIndex: 0,
  epg: [] as EpgProgramme[],
  epgLoading: false,
  /** 当前直播源 EPG 配置原文 */
  liveEpgConfig: '' as string,
  /** 收藏频道名集合（当前源） */
  keepNames: {} as Record<string, true>,
  query: '' as string,
  /** 各频道记住的线路：`${group}\0${name}` → index */
  linePrefs: {} as Record<string, number>,
});

export function getTvLiveState() {
  return liveState;
}

function liveKeepKey(sourceName: string, channelName: string): string {
  return `live:${sourceName}:${channelName}`;
}

/** 同组内：同名频道合并为一条，线路 URL 去重后并入（对齐常见直播列表体验） */
function dedupeLiveChannels(channels: LiveChannel[]): LiveChannel[] {
  const order: string[] = [];
  const byName = new Map<string, LiveChannel>();
  for (const ch of channels) {
    const name = (ch.name ?? '').trim();
    if (!name) continue;
    const urls = [...new Set((ch.urls ?? []).map((u) => String(u ?? '').trim()).filter(Boolean))];
    const existing = byName.get(name);
    if (!existing) {
      byName.set(name, {
        ...ch,
        name,
        urls,
      });
      order.push(name);
      continue;
    }
    const urlSet = new Set(existing.urls);
    for (const u of urls) urlSet.add(u);
    existing.urls = [...urlSet];
    if (!existing.logo && ch.logo) existing.logo = ch.logo;
    if (!existing.tvgId && ch.tvgId) existing.tvgId = ch.tvgId;
    if (!existing.tvgName && ch.tvgName) existing.tvgName = ch.tvgName;
    if (!existing.epg && ch.epg) existing.epg = ch.epg;
    if (!existing.catchup && ch.catchup) existing.catchup = ch.catchup;
    if (!existing.catchupSource && ch.catchupSource) {
      existing.catchupSource = ch.catchupSource;
    }
    if (!existing.header && ch.header) existing.header = ch.header;
    if (!existing.ua && ch.ua) existing.ua = ch.ua;
    if (!existing.referer && ch.referer) existing.referer = ch.referer;
    if (!existing.origin && ch.origin) existing.origin = ch.origin;
  }
  return order.map((n) => byName.get(n)!);
}

/** 同名分组合并，组内频道再去重 */
function dedupeLiveGroups(groups: LiveGroup[]): LiveGroup[] {
  const order: string[] = [];
  const byName = new Map<string, LiveChannel[]>();
  for (const g of groups) {
    const name = (g.name ?? '').trim() || '未分组';
    if (!byName.has(name)) {
      byName.set(name, []);
      order.push(name);
    }
    byName.get(name)!.push(...(g.channel ?? []));
  }
  return order.map((name) => ({
    name,
    channel: dedupeLiveChannels(byName.get(name) ?? []),
  }));
}

function injectKeepGroup(
  groups: LiveGroup[],
  keepChannels: LiveChannel[],
): LiveGroup[] {
  const rest = dedupeLiveGroups(groups.filter((g) => g.name !== TV_LIVE_KEEP_GROUP));
  if (!keepChannels.length) return rest;
  return [
    { name: TV_LIVE_KEEP_GROUP, channel: dedupeLiveChannels(keepChannels) },
    ...rest,
  ];
}

async function loadKeepNames(sourceName: string): Promise<Record<string, true>> {
  const rows = await TvDao.listKeep();
  const out: Record<string, true> = {};
  const prefix = `live:${sourceName}:`;
  for (const row of rows) {
    if (row.kind !== 'live') continue;
    if (row.key.startsWith(prefix)) {
      out[row.vodName] = true;
    } else if (row.siteKey === sourceName) {
      out[row.vodName] = true;
    }
  }
  return out;
}

function resolveSourceName(sources: LiveSource[], preferred?: string): string {
  const ui = getTvLiveUi();
  const want = preferred || ui.homeSourceName;
  if (want && sources.some((s) => s.name === want)) return want;
  return sources[0]?.name ?? '';
}

export async function bootstrapTvLive(preferredSource?: string): Promise<void> {
  setLiveState({ loading: true, error: '' });
  try {
    const sources = await LiveApi.listLiveSources();
    if (!sources.length) {
      setLiveState({
        loading: false,
        error: formatTvUserError('请先导入含 lives 的配置'),
        sources: [],
        sourceName: '',
        groups: [],
        channels: [],
        groupName: '',
        channelName: '',
      });
      return;
    }
    const sourceName = resolveSourceName(sources, preferredSource);
    await loadLiveSource(sourceName, sources);
  } catch (e) {
    setLiveState({
      loading: false,
      error: reportTvError('加载直播失败', e),
    });
  }
}

export async function loadLiveSource(
  sourceName: string,
  sourcesHint?: LiveSource[],
): Promise<void> {
  setLiveState({ loading: true, error: '', sourceName });
  try {
    const sources = sourcesHint ?? (await LiveApi.listLiveSources());
    const loaded = await LiveApi.loadLive(sourceName || undefined);
    const keepNames = await loadKeepNames(loaded.source.name);
    const keepChannels: LiveChannel[] = [];
    for (const ch of loaded.channels) {
      if (keepNames[ch.name]) {
        keepChannels.push({
          name: ch.name,
          urls: ch.urls,
          logo: ch.logo,
          tvgId: ch.tvgId,
          catchup: ch.catchup,
          catchupSource: ch.catchupSource,
        });
      }
    }
    const groups = injectKeepGroup(loaded.groups, keepChannels);
    const channels = groups.flatMap((g) =>
      g.channel.map((c) => ({ ...c, group: g.name })),
    );
    const last = decodeLiveKeep(getTvLiveUi().lastKeep);
    let groupName = groups[0]?.name ?? '';
    let channelName = '';
    let lineIndex = 0;
    if (last && last.source === loaded.source.name) {
      if (groups.some((g) => g.name === last.group)) groupName = last.group;
      const inGroup = groups
        .find((g) => g.name === groupName)
        ?.channel.some((c) => c.name === last.channel);
      if (inGroup) {
        channelName = last.channel;
        lineIndex = last.lineIndex;
      }
    }
    if (!channelName) {
      channelName = groups.find((g) => g.name === groupName)?.channel[0]?.name ?? '';
    }

    const linePrefs: Record<string, number> = {};
    if (channelName) {
      linePrefs[`${groupName}\0${channelName}`] = lineIndex;
    }

    setLiveState({
      loading: false,
      sources,
      sourceName: loaded.source.name,
      groups,
      channels,
      groupName,
      channelName,
      lineIndex,
      keepNames,
      linePrefs,
      liveEpgConfig: loaded.source.epg ?? '',
      error: '',
    });
    setTvLiveHomeSourceName(loaded.source.name);
    void refreshLiveEpg(loaded.source.epg);
  } catch (e) {
    setLiveState({
      loading: false,
      error: reportTvError('加载直播失败', e),
    });
  }
}

export async function refreshLiveEpg(epgUrl?: string): Promise<void> {
  const url =
    epgUrl ??
    liveState.sources.find((s) => s.name === liveState.sourceName)?.epg ??
    '';
  if (!url) {
    setLiveState({ epg: [], epgLoading: false, liveEpgConfig: '' });
    return;
  }
  setLiveState({ epgLoading: true, liveEpgConfig: url });
  try {
    const list = await loadBulkEpg(url);
    setLiveState({ epg: list, epgLoading: false });
    const ch = getSelectedChannel();
    if (ch && pickEpgApiTemplate(url)) {
      void refreshChannelEpg(ch);
    }
  } catch {
    setLiveState({ epg: [], epgLoading: false });
  }
}

/** 按频道 API 模板拉 EPG（含 {name}/{date}）并合并进列表 */
export async function refreshChannelEpg(
  channel: LiveChannelRef,
): Promise<void> {
  const liveEpg = liveState.liveEpgConfig;
  if (!pickEpgApiTemplate(liveEpg)) return;
  setLiveState('epgLoading', true);
  try {
    const extra = await loadChannelEpg(liveEpg, channel);
    setLiveState((s) => ({
      epg: mergeEpgProgrammes(s.epg, extra),
      epgLoading: false,
    }));
  } catch {
    setLiveState('epgLoading', false);
  }
}

export function setLiveGroup(groupName: string): void {
  if (!groupName || groupName === liveState.groupName) return;
  const group = liveState.groups.find((g) => g.name === groupName);
  const first = group?.channel[0];
  if (!first) {
    setLiveState({ groupName, channelName: '', lineIndex: 0 });
    return;
  }
  selectLiveChannel({ ...first, group: groupName });
}

export function setLiveChannel(channelName: string): void {
  if (!channelName) return;
  setLiveState({ channelName, lineIndex: 0 });
}

/** 选中频道（可跨组；线路沿用该频道上次选择） */
export function selectLiveChannel(channel: LiveChannelRef): void {
  const key = liveChannelLineKey(channel);
  const pref = liveState.linePrefs[key];
  const lineIndex =
    typeof pref === 'number'
      ? Math.max(0, Math.min(channel.urls.length - 1, pref))
      : 0;
  setLiveState({
    groupName: channel.group,
    channelName: channel.name,
    lineIndex,
  });
  void refreshChannelEpg(channel);
}

function liveChannelLineKey(ch: { group: string; name: string }): string {
  return `${ch.group}\0${ch.name}`;
}

/** 列表项展示 / 播放用的线路下标 */
export function getLiveChannelLineIndex(ch: LiveChannelRef): number {
  const key = liveChannelLineKey(ch);
  const pref = liveState.linePrefs[key];
  if (typeof pref === 'number') {
    return Math.max(0, Math.min(ch.urls.length - 1, Math.floor(pref)));
  }
  if (liveState.groupName === ch.group && liveState.channelName === ch.name) {
    return Math.max(0, Math.min(ch.urls.length - 1, liveState.lineIndex));
  }
  return 0;
}

/** 在列表项切换线路（同时选中该频道） */
export function setLiveChannelLine(channel: LiveChannelRef, index: number): void {
  const next = Math.max(0, Math.min(channel.urls.length - 1, Math.floor(index)));
  const key = liveChannelLineKey(channel);
  setLiveState({
    groupName: channel.group,
    channelName: channel.name,
    lineIndex: next,
    linePrefs: { ...liveState.linePrefs, [key]: next },
  });
}

export function clearLivePlayState(): void {
  setLivePlay({
    url: '',
    name: '',
    epgText: '',
    lineIndex: 0,
    sourceName: '',
    groupName: '',
    channelName: '',
    urls: [],
    headers: {},
  });
}

function currentSourceHeader(): Record<string, string> | undefined {
  return liveState.sources.find((s) => s.name === liveState.sourceName)?.header;
}

function buildPlayFromRaw(
  ch: LiveChannelRef,
  rawUrl: string,
): { url: string; headers: Record<string, string> } {
  const resolved = resolveLivePlayUrl(rawUrl);
  const headers = buildLivePlayHeaders(ch, rawUrl, currentSourceHeader());
  return { url: resolved.url, headers };
}

export function setLiveLineIndex(index: number): void {
  const ch = getSelectedChannel();
  if (!ch) return;
  setLiveChannelLine(ch, index);
}

export function setLiveQuery(query: string): void {
  setLiveState('query', query);
}

export function getSelectedChannel(): LiveChannelRef | undefined {
  const { groupName, channelName, channels } = liveState;
  return channels.find((c) => c.group === groupName && c.name === channelName);
}

export function getVisibleChannels(): LiveChannelRef[] {
  const q = liveState.query.trim().toLowerCase();
  let list = liveState.channels.filter((c) => c.group === liveState.groupName);
  if (q) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tvgId ?? '').toLowerCase().includes(q),
    );
  }
  return list;
}

export function getChannelProgrammes(): EpgProgramme[] {
  const ch = getSelectedChannel();
  if (!ch) return [];
  return programmesForChannel(liveState.epg, ch.tvgId || ch.name);
}

export function isChannelKept(channelName: string): boolean {
  return !!liveState.keepNames[channelName];
}

export async function toggleLiveKeep(channel?: LiveChannelRef): Promise<void> {
  const ch = channel ?? getSelectedChannel();
  if (!ch) return;
  const sourceName = liveState.sourceName;
  const key = liveKeepKey(sourceName, ch.name);
  if (liveState.keepNames[ch.name]) {
    await TvDao.removeKeep(key);
  } else {
    await TvDao.upsertKeep({
      key,
      siteKey: sourceName,
      vodId: ch.name,
      vodName: ch.name,
      vodPic: ch.logo ?? '',
      kind: 'live',
      cid: 0,
      createdAt: Date.now(),
    });
  }
  // 重建收藏分组
  await loadLiveSource(sourceName, liveState.sources);
}

function rememberKeep(ch: LiveChannelRef, lineIndex: number): void {
  setTvLiveLastKeep(
    encodeLiveKeep(liveState.sourceName, ch.group, ch.name, lineIndex),
  );
}

export function playLiveChannel(options?: {
  channel?: LiveChannelRef;
  lineIndex?: number;
  catchup?: boolean;
  programme?: EpgProgramme;
}): void {
  const ch = options?.channel ?? getSelectedChannel();
  if (!ch?.urls.length) return;
  let lineIndex =
    options?.lineIndex ??
    (options?.channel ? getLiveChannelLineIndex(ch) : liveState.lineIndex);
  lineIndex = Math.max(0, Math.min(ch.urls.length - 1, lineIndex));
  const liveUrl = ch.urls[lineIndex] ?? ch.urls[0] ?? '';
  const prog =
    options?.programme ??
    currentProgramme(liveState.epg, ch.tvgId || ch.name);
  let rawUrl = liveUrl;
  if (options?.catchup && prog) {
    const spec = catchupFromChannelAttrs(ch.catchup, ch.catchupSource);
    if (spec?.source) {
      rawUrl = formatCatchupUrl(liveUrl, prog, spec);
    }
  }
  const { url, headers } = buildPlayFromRaw(ch, rawUrl);
  if (!url) return;
  const epgText = formatProgramme(prog);
  setLiveState({
    groupName: ch.group,
    channelName: ch.name,
    lineIndex,
    linePrefs: {
      ...liveState.linePrefs,
      [liveChannelLineKey(ch)]: lineIndex,
    },
  });
  rememberKeep(ch, lineIndex);
  void import('@/stores/tv-hub/detail').then((m) => m.clearTvDetailPlay());
  setLivePlay({
    url,
    name: options?.catchup ? `${ch.name}（回看）` : ch.name,
    epgText,
    lineIndex,
    sourceName: liveState.sourceName,
    groupName: ch.group,
    channelName: ch.name,
    urls: [...ch.urls],
    headers,
  });
  setTvSection('play');
}

/** 播放失败自动切下一线路（change） */
export function playNextLiveLine(): boolean {
  if (!getTvLiveUi().change) return false;
  const urls = livePlay.urls;
  if (urls.length <= 1) return false;
  const next = (livePlay.lineIndex + 1) % urls.length;
  if (next === livePlay.lineIndex) return false;
  const ch = getSelectedChannel();
  const raw = urls[next] ?? '';
  const resolved = ch
    ? buildPlayFromRaw(ch, raw)
    : {
        url: resolveLivePlayUrl(raw).url,
        headers: buildLivePlayHeaders(undefined, raw, currentSourceHeader()),
      };
  setLivePlay({
    lineIndex: next,
    url: resolved.url,
    headers: resolved.headers,
  });
  if (ch) {
    setLiveChannelLine(ch, next);
    rememberKeep(ch, next);
  } else {
    setLiveState('lineIndex', next);
  }
  return true;
}

/** 上下键换台（across 时跨组） */
export function shiftLiveChannel(delta: number): void {
  const across = getTvLiveUi().across;
  const groups = liveState.groups;
  if (!groups.length) return;
  const gIdx = groups.findIndex((g) => g.name === liveState.groupName);
  const group = groups[gIdx >= 0 ? gIdx : 0]!;
  const list = group.channel;
  const cIdx = list.findIndex((c) => c.name === liveState.channelName);
  let nextG = gIdx >= 0 ? gIdx : 0;
  let nextC = cIdx >= 0 ? cIdx + delta : 0;
  if (nextC < 0) {
    if (!across) return;
    nextG = (nextG - 1 + groups.length) % groups.length;
    const prev = groups[nextG]!;
    nextC = Math.max(0, prev.channel.length - 1);
  } else if (nextC >= list.length) {
    if (!across) return;
    nextG = (nextG + 1) % groups.length;
    nextC = 0;
  }
  const nextGroup = groups[nextG]!;
  const nextCh = nextGroup.channel[nextC];
  if (!nextCh) return;
  playLiveChannel({
    channel: { ...nextCh, group: nextGroup.name },
    lineIndex: 0,
  });
}

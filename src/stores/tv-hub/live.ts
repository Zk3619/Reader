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
  loadEpg,
  programmesForChannel,
  type EpgProgramme,
} from '@/lib/media/tv/live/epg';
import {
  catchupFromChannelAttrs,
  formatCatchupUrl,
} from '@/lib/media/tv/live/catchup';
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
  /** 收藏频道名集合（当前源） */
  keepNames: {} as Record<string, true>,
  query: '' as string,
});

export function getTvLiveState() {
  return liveState;
}

function liveKeepKey(sourceName: string, channelName: string): string {
  return `live:${sourceName}:${channelName}`;
}

function injectKeepGroup(
  groups: LiveGroup[],
  keepChannels: LiveChannel[],
): LiveGroup[] {
  const rest = groups.filter((g) => g.name !== TV_LIVE_KEEP_GROUP);
  if (!keepChannels.length) return rest;
  return [{ name: TV_LIVE_KEEP_GROUP, channel: keepChannels }, ...rest];
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
    setLiveState({ epg: [], epgLoading: false });
    return;
  }
  setLiveState('epgLoading', true);
  try {
    const list = await loadEpg(url);
    setLiveState({ epg: list, epgLoading: false });
  } catch {
    setLiveState({ epg: [], epgLoading: false });
  }
}

export function setLiveGroup(groupName: string): void {
  if (!groupName || groupName === liveState.groupName) return;
  const group = liveState.groups.find((g) => g.name === groupName);
  const first = group?.channel[0]?.name ?? '';
  setLiveState({ groupName, channelName: first, lineIndex: 0 });
}

export function setLiveChannel(channelName: string): void {
  if (!channelName) return;
  setLiveState({ channelName, lineIndex: 0 });
}

/** 选中频道（可跨组，不重置为组内第一个） */
export function selectLiveChannel(channel: LiveChannelRef): void {
  setLiveState({
    groupName: channel.group,
    channelName: channel.name,
    lineIndex: 0,
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
  });
}

export function setLiveLineIndex(index: number): void {
  const ch = getSelectedChannel();
  if (!ch) return;
  const next = Math.max(0, Math.min(ch.urls.length - 1, Math.floor(index)));
  setLiveState('lineIndex', next);
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
    (options?.channel ? 0 : liveState.lineIndex);
  lineIndex = Math.max(0, Math.min(ch.urls.length - 1, lineIndex));
  const liveUrl = ch.urls[lineIndex] ?? ch.urls[0] ?? '';
  const prog =
    options?.programme ??
    currentProgramme(liveState.epg, ch.tvgId || ch.name);
  let url = liveUrl;
  if (options?.catchup && prog) {
    const spec = catchupFromChannelAttrs(ch.catchup, ch.catchupSource);
    if (spec?.source) {
      url = formatCatchupUrl(liveUrl, prog, spec);
    }
  }
  const epgText = formatProgramme(prog);
  setLiveState({
    groupName: ch.group,
    channelName: ch.name,
    lineIndex,
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
  setLivePlay({
    lineIndex: next,
    url: urls[next] ?? '',
  });
  setLiveState('lineIndex', next);
  const ch = getSelectedChannel();
  if (ch) rememberKeep(ch, next);
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

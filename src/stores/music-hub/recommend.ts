/**
 * Music Hub 推荐页状态（统一四区：热搜 / 推荐歌曲 / 推荐歌单 / 排行榜精选）
 * - LX 五源：热搜词 + 推荐/最热歌单 + 排行榜
 * - netease（Neri Home）：热力飙升→热搜、私人雷达→推荐歌曲、为你推荐→推荐歌单
 * - ytm：FEmusic_home → 推荐歌单
 * - MF 插件：推荐歌单（+ 榜单）
 * - bili 无推荐数据，不进来源下拉
 */

import { createStore } from 'solid-js/store';
import {
  browseSongLists,
  getLeaderboardBoards,
  getSongListSorts,
  hotSearchKeywords,
  MUSIC_SDK_SOURCES,
  type MusicSdkSource,
} from '@/lib/media/audio/music-sdk';
import type {
  HubBrowseSource,
  LeaderboardBoard,
  OnlinePlaylistSummary,
} from '@/lib/media/audio/music-sdk/types';
import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import {
  browseMfRecommendSheets,
  browseMfRecommendTags,
  browseMfTopLists,
  listMfPluginsWithAbility,
} from '@/lib/media/audio/online/mf-plugin/browse';
import {
  hubMfPluginId,
  isHubMfSource,
} from '@/lib/media/audio/online/mf-plugin/hub-browse-sources';
import { pluginHasMethod } from '@/lib/media/audio/online/mf-plugin';
import { mfSourceKey } from '@/lib/media/audio/online/mf-plugin/types';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { notifyPageError } from '@/lib/ui/page-notify';

const MAX_PLAYLISTS = 30;
const MAX_BOARDS = 24;
const MAX_HOT_KEYWORDS = 16;
const MAX_TRACK_SECTION = 24;

export interface MusicHubRecommendState {
  source: HubBrowseSource;
  loading: boolean;
  error: string | null;
  /** 热搜区：LX 为关键词芯片 */
  hotKeywords: string[];
  /** 热搜区：netease 为「热力飙升」曲目 */
  hotTracks: AudioTrack[];
  /** 推荐歌曲区：netease「私人雷达」 */
  recommendTracks: AudioTrack[];
  /** 推荐歌单区 */
  playlists: OnlinePlaylistSummary[];
  /** 排行榜精选区 */
  boards: LeaderboardBoard[];
  loadedSource: HubBrowseSource | null;
}

function isLxRecommendSource(source: string): source is MusicSdkSource {
  return (MUSIC_SDK_SOURCES as readonly string[]).includes(source);
}

function isRecommendCapableSource(source: string): boolean {
  return isLxRecommendSource(source) || source === 'netease' || source === 'ytm' || isHubMfSource(source);
}

function resolvePersistedRecommendSource(): HubBrowseSource {
  const raw = getMusicSettings().musicRecommendSource;
  if (typeof raw !== 'string' || !raw.trim()) return 'wy';
  if (isRecommendCapableSource(raw)) return raw as HubBrowseSource;
  return 'wy';
}

const [recommendState, setRecommendState] = createStore<MusicHubRecommendState>({
  source: resolvePersistedRecommendSource(),
  loading: false,
  error: null,
  hotKeywords: [],
  hotTracks: [],
  recommendTracks: [],
  playlists: [],
  boards: [],
  loadedSource: null,
});

let loadSeq = 0;

export function getMusicRecommendState(): MusicHubRecommendState {
  return recommendState;
}

/** 仅列出有推荐数据的来源：LX 五源 + netease + ytm + 支持推荐的 MF（bili 无推荐流） */
export function listMusicRecommendSources(): HubBrowseSource[] {
  const mfs = listMfPluginsWithAbility('getRecommendSheetTags').map(
    (p) => mfSourceKey(p.id) as HubBrowseSource,
  );
  return [
    ...MUSIC_SDK_SOURCES,
    'netease' as HubBrowseSource,
    'ytm' as HubBrowseSource,
    ...mfs,
  ];
}

function recommendSortId(source: MusicSdkSource): string {
  const sorts = getSongListSorts(source);
  const byRecommend = sorts.find(
    (s) => /推荐/.test(s.name) || /recommend/i.test(s.id),
  );
  if (byRecommend) return byRecommend.id;
  const byHot = sorts.find((s) => /最热|热门/.test(s.name) || /hot/i.test(s.id));
  return byHot?.id ?? sorts[0]?.id ?? 'hot';
}

async function fetchHotKeywords(source: HubBrowseSource): Promise<string[]> {
  // netease 的热搜区用「热力飙升」曲目，不再借用 LX wy 热搜词
  if (!isLxRecommendSource(source)) return [];
  const words = await hotSearchKeywords(source as AudioTrackSource);
  return words.slice(0, MAX_HOT_KEYWORDS);
}

async function fetchRecommendPlaylists(
  source: HubBrowseSource,
): Promise<OnlinePlaylistSummary[]> {
  if (isLxRecommendSource(source)) {
    const result = await browseSongLists(source, recommendSortId(source), null, 1);
    return (result.list ?? []).slice(0, MAX_PLAYLISTS);
  }
  if (source === 'netease') {
    // Neri Home「为你推荐」
    const { getRecommendedPlaylists } = await import(
      '@/lib/media/audio/platform/api/netease'
    );
    const pls = await getRecommendedPlaylists(MAX_PLAYLISTS);
    return pls
      .filter((p) => p.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        coverUrl: p.coverUrl,
        trackCount: p.trackCount,
        source: 'netease' as HubBrowseSource,
      }));
  }
  if (source === 'ytm') {
    const { listYtmHomeRecommendPlaylists } = await import(
      '@/lib/media/audio/platform/api/ytm'
    );
    const pls = await listYtmHomeRecommendPlaylists(MAX_PLAYLISTS);
    return pls.map((p) => ({
      id: p.browseId,
      name: p.name,
      coverUrl: p.coverUrl,
      trackCount: p.trackCount,
      author: p.subtitle,
      source: 'ytm' as HubBrowseSource,
    }));
  }
  const pluginId = hubMfPluginId(source);
  if (!pluginId) return [];
  const tags = await browseMfRecommendTags(pluginId);
  const tag = tags.pinned?.[0] ?? tags.data?.[0]?.data?.[0];
  const payload = tag ? { ...tag, id: String(tag.id ?? '') } : { id: '' };
  const result = await browseMfRecommendSheets(pluginId, payload, 1);
  return (result.list ?? []).slice(0, MAX_PLAYLISTS) as OnlinePlaylistSummary[];
}

async function fetchRecommendBoards(
  source: HubBrowseSource,
): Promise<LeaderboardBoard[]> {
  if (isLxRecommendSource(source)) {
    const boards = await getLeaderboardBoards(source);
    return boards.slice(0, MAX_BOARDS);
  }
  if (isHubMfSource(source)) {
    const pluginId = hubMfPluginId(source);
    if (!pluginId || !pluginHasMethod(pluginId, 'getTopLists')) return [];
    const boards = await browseMfTopLists(pluginId);
    return boards.slice(0, MAX_BOARDS) as LeaderboardBoard[];
  }
  return [];
}

/** Neri Home 曲目区：热力飙升（→热搜）/ 私人雷达（→推荐歌曲） */
async function fetchNeteaseHomeTrackSections(
  source: HubBrowseSource,
): Promise<{ hotTracks: AudioTrack[]; recommendTracks: AudioTrack[] }> {
  if (source !== 'netease') return { hotTracks: [], recommendTracks: [] };
  const { neteaseSearch } = await import('@/lib/media/audio/platform/api/netease');
  const [hot, radar] = await Promise.all([
    neteaseSearch('热歌', 1, MAX_TRACK_SECTION).catch(() => [] as AudioTrack[]),
    neteaseSearch('私人雷达', 1, MAX_TRACK_SECTION).catch(() => [] as AudioTrack[]),
  ]);
  return {
    hotTracks: hot.slice(0, MAX_TRACK_SECTION),
    recommendTracks: radar.slice(0, MAX_TRACK_SECTION),
  };
}

export async function loadMusicRecommend(options?: { force?: boolean }): Promise<void> {
  const source = recommendState.source;
  if (
    !options?.force &&
    recommendState.loadedSource === source &&
    !recommendState.error
  ) {
    return;
  }
  const seq = ++loadSeq;
  setRecommendState({ loading: true, error: null });

  const [hotRes, playlistRes, boardRes, trackRes] = await Promise.allSettled([
    fetchHotKeywords(source),
    fetchRecommendPlaylists(source),
    fetchRecommendBoards(source),
    fetchNeteaseHomeTrackSections(source),
  ]);
  if (seq !== loadSeq || recommendState.source !== source) return;

  const playlists = playlistRes.status === 'fulfilled' ? playlistRes.value : [];
  const hotKeywords = hotRes.status === 'fulfilled' ? hotRes.value : [];
  const boards = boardRes.status === 'fulfilled' ? boardRes.value : [];
  const trackSections =
    trackRes.status === 'fulfilled'
      ? trackRes.value
      : { hotTracks: [] as AudioTrack[], recommendTracks: [] as AudioTrack[] };

  const allFailed =
    playlistRes.status === 'rejected' &&
    hotRes.status === 'rejected' &&
    boardRes.status === 'rejected' &&
    trackRes.status === 'rejected';
  const error = allFailed
    ? playlistRes.reason instanceof Error
      ? playlistRes.reason.message
      : '推荐内容加载失败'
    : null;

  if (error) {
    notifyPageError('推荐内容加载失败', error);
  }

  setRecommendState({
    loading: false,
    error,
    hotKeywords,
    hotTracks: trackSections.hotTracks,
    recommendTracks: trackSections.recommendTracks,
    playlists,
    boards,
    loadedSource: error ? null : source,
  });
}

export async function ensureMusicRecommendLoaded(): Promise<void> {
  await loadMusicRecommend();
}

export function setMusicRecommendSource(source: HubBrowseSource): void {
  if (source === recommendState.source) return;
  setRecommendState({
    source,
    hotKeywords: [],
    hotTracks: [],
    recommendTracks: [],
    playlists: [],
    boards: [],
    error: null,
    loadedSource: null,
  });
  setMusicSettings({ musicRecommendSource: source }, { persistImmediate: true });
  void loadMusicRecommend({ force: true });
}

/** 配置 hydrate 后回填推荐来源（不自动拉网，等页面 effect 触发） */
export function syncRecommendSourceFromSettings(): void {
  const next = resolvePersistedRecommendSource();
  if (next === recommendState.source) return;
  setRecommendState({
    source: next,
    hotKeywords: [],
    hotTracks: [],
    recommendTracks: [],
    playlists: [],
    boards: [],
    error: null,
    loadedSource: null,
  });
}

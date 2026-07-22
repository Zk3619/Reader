/**
 * Music Hub 排行榜状态（按来源 / 榜单页缓存 + 滚动/分页加载）
 */

import { createStore } from 'solid-js/store';
import {
  browseLeaderboard,
  getLeaderboardBoards,
  MUSIC_SDK_SOURCE_LABELS,
  MUSIC_SDK_SOURCES,
  type MusicSdkSource,
} from '@/lib/media/audio/music-sdk';
import type { LeaderboardBoard, LeaderboardDetail, HubBrowseSource } from '@/lib/media/audio/music-sdk/types';
import { browseMfTopListDetail, browseMfTopLists } from '@/lib/media/audio/online/mf-plugin/browse';
import {
  hubMfPluginId,
  isHubMfSource,
  listHubLeaderboardSources,
  hubBrowseSourceLabel,
} from '@/lib/media/audio/online/mf-plugin/hub-browse-sources';
import type { MfSheetItem } from '@/lib/media/audio/online/mf-plugin/types';
import { notifyPageError } from '@/lib/ui/page-notify';
import { getMusicLeaderboardUi } from '@/stores/music-hub/music-leaderboard-ui';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export interface MusicHubLeaderboardState {
  source: HubBrowseSource;
  boards: LeaderboardBoard[];
  selectedBoard: LeaderboardBoard | null;
  detail: LeaderboardDetail | null;
  page: number;
  total: number;
  limit: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

interface LeaderboardSourceCache {
  boards: LeaderboardBoard[];
  selectedBoardId: string | null;
  page: number;
}

const [leaderboardState, setLeaderboardState] = createStore<MusicHubLeaderboardState>({
  source: 'wy',
  boards: [],
  selectedBoard: null,
  detail: null,
  page: 1,
  total: 0,
  limit: 100,
  hasMore: false,
  loading: false,
  loadingMore: false,
  error: null,
});

/** 各来源下的榜单列表与上次选中项 */
const sourceCache = new Map<HubBrowseSource, LeaderboardSourceCache>();
/** 榜单单页详情：`${boardId}__${page}` */
const detailCache = new Map<string, LeaderboardDetail>();

let loadBoardsSeq = 0;
let loadDetailSeq = 0;

function detailCacheKey(boardId: string, page: number): string {
  return `${boardId}__${page}`;
}

function resolvePagingTotal(
  page: number,
  limit: number,
  listLength: number,
  reportedTotal: number,
): number {
  if (page === 1 || (reportedTotal > 0 && listLength > 0)) {
    if (reportedTotal > 0) return reportedTotal;
  }
  if (reportedTotal > 0) return reportedTotal;
  if (listLength >= limit) return limit * page + 1;
  return Math.max(0, limit * (page - 1) + listLength);
}

function resolveHasMore(page: number, limit: number, listLength: number, total: number): boolean {
  if (listLength >= limit) return true;
  if (total > 0) return page * limit < total;
  return false;
}

function pagingFromDetail(
  detail: LeaderboardDetail,
  page: number,
): { total: number; limit: number; hasMore: boolean } {
  const limit = Math.max(1, detail.limit || leaderboardState.limit || 100);
  const total = resolvePagingTotal(page, limit, detail.tracks.length, detail.total);
  return {
    total,
    limit,
    hasMore: resolveHasMore(page, limit, detail.tracks.length, total),
  };
}

function rememberSourceSnapshot(): void {
  sourceCache.set(leaderboardState.source, {
    boards: leaderboardState.boards.slice(),
    selectedBoardId: leaderboardState.selectedBoard?.id ?? null,
    page: leaderboardState.page,
  });
}

function rememberDetail(detail: LeaderboardDetail, page: number): void {
  detailCache.set(detailCacheKey(detail.board.id, page), detail);
}

function boardById(
  boards: LeaderboardBoard[],
  id: string | null | undefined,
): LeaderboardBoard | null {
  if (!id) return null;
  return boards.find((b) => b.id === id) ?? null;
}

async function fetchLeaderboardBoards(source: HubBrowseSource): Promise<LeaderboardBoard[]> {
  if (!isHubMfSource(source)) {
    return getLeaderboardBoards(source as MusicSdkSource);
  }
  const pluginId = hubMfPluginId(source);
  if (!pluginId) return [];
  const raw = await browseMfTopLists(pluginId);
  return raw.map((b) => ({
    id: b.id,
    name: b.name,
    bangId: b.bangId,
    source: b.source as HubBrowseSource,
    group: b.group,
    mfPluginId: b.mfPluginId,
    mfSheetItem: b.mfSheetItem,
  }));
}

function applySourceView(params: {
  source: HubBrowseSource;
  boards: LeaderboardBoard[];
  selectedBoard: LeaderboardBoard | null;
  detail: LeaderboardDetail | null;
  page: number;
  loading?: boolean;
  loadingMore?: boolean;
  error?: string | null;
}): void {
  const paging = params.detail
    ? pagingFromDetail(params.detail, params.page)
    : { total: 0, limit: leaderboardState.limit, hasMore: false };

  setLeaderboardState({
    source: params.source,
    boards: params.boards,
    selectedBoard: params.selectedBoard,
    detail: params.detail,
    page: params.page,
    total: paging.total,
    limit: paging.limit,
    hasMore: paging.hasMore,
    loading: params.loading ?? false,
    loadingMore: params.loadingMore ?? false,
    error: params.error ?? null,
  });
  sourceCache.set(params.source, {
    boards: params.boards.slice(),
    selectedBoardId: params.selectedBoard?.id ?? null,
    page: params.page,
  });
  if (params.detail) {
    rememberDetail(params.detail, params.page);
  }
}

export function getLeaderboardState(): MusicHubLeaderboardState {
  return leaderboardState;
}

export function leaderboardPageCount(): number {
  const limit = Math.max(1, leaderboardState.limit);
  return Math.max(1, Math.ceil(Math.max(leaderboardState.total, 1) / limit));
}

export function setLeaderboardSource(source: HubBrowseSource): void {
  if (source === leaderboardState.source) return;
  rememberSourceSnapshot();

  const cached = sourceCache.get(source);
  if (cached && cached.boards.length > 0) {
    const selected =
      boardById(cached.boards, cached.selectedBoardId) ?? cached.boards[0] ?? null;
    const page = selected ? cached.page || 1 : 1;
    const detail = selected
      ? (detailCache.get(detailCacheKey(selected.id, page)) ?? null)
      : null;

    applySourceView({
      source,
      boards: cached.boards,
      selectedBoard: selected,
      detail,
      page,
      loading: false,
      error: null,
    });

    if (selected && !detail) {
      void selectLeaderboardBoard(selected, page);
    }
    return;
  }

  setLeaderboardState({ source, loading: true, error: null });
  void loadLeaderboardBoards({ replaceOnReady: true });
}

export async function loadLeaderboardBoards(options?: {
  force?: boolean;
  replaceOnReady?: boolean;
}): Promise<void> {
  const source = leaderboardState.source;
  const force = options?.force === true;

  if (!force) {
    const cached = sourceCache.get(source);
    if (cached && cached.boards.length > 0) {
      const selected =
        boardById(cached.boards, cached.selectedBoardId) ??
        boardById(cached.boards, leaderboardState.selectedBoard?.id) ??
        cached.boards[0] ??
        null;
      const page = selected ? cached.page || 1 : 1;
      const detail = selected
        ? (detailCache.get(detailCacheKey(selected.id, page)) ??
          (leaderboardState.detail?.board.id === selected.id
            ? leaderboardState.detail
            : null))
        : null;

      applySourceView({
        source,
        boards: cached.boards,
        selectedBoard: selected,
        detail,
        page,
        loading: false,
        error: null,
      });

      if (selected && !detail) {
        void selectLeaderboardBoard(selected, page);
      }
      return;
    }
  }

  const seq = ++loadBoardsSeq;
  setLeaderboardState({ loading: true, error: null });

  try {
    const boards = await fetchLeaderboardBoards(source);
    if (seq !== loadBoardsSeq || leaderboardState.source !== source) return;

    const prevSelectedId =
      sourceCache.get(source)?.selectedBoardId ?? leaderboardState.selectedBoard?.id ?? null;
    const selected =
      (!force ? boardById(boards, prevSelectedId) : null) ?? boards[0] ?? null;
    const page = 1;

    if (!selected) {
      applySourceView({
        source,
        boards,
        selectedBoard: null,
        detail: null,
        page: 1,
        loading: false,
        error: null,
      });
      return;
    }

    const cachedDetail = !force
      ? (detailCache.get(detailCacheKey(selected.id, page)) ?? null)
      : null;

    if (cachedDetail) {
      applySourceView({
        source,
        boards,
        selectedBoard: selected,
        detail: cachedDetail,
        page,
        loading: false,
        error: null,
      });
      return;
    }

    const detailSeq = ++loadDetailSeq;
    const detail = isHubMfSource(source)
      ? await (async () => {
          const pluginId = hubMfPluginId(source) ?? selected.mfPluginId;
          const sheet =
            (selected.mfSheetItem as MfSheetItem | undefined) ??
            ({ id: selected.bangId, platform: pluginId ?? '' } as MfSheetItem);
          if (!pluginId) throw new Error('插件源无效');
          const result = await browseMfTopListDetail(pluginId, sheet, page);
          return {
            board: selected,
            tracks: result.tracks,
            total: result.tracks.length,
            page,
            limit: leaderboardState.limit,
          } satisfies LeaderboardDetail;
        })()
      : await browseLeaderboard(source as MusicSdkSource, selected.bangId, page);
    if (seq !== loadBoardsSeq || leaderboardState.source !== source) return;
    // detailSeq 被 selectLeaderboardBoard 等抢占时，由持有者收尾，此处不可 apply 以免覆盖
    if (detailSeq !== loadDetailSeq) return;

    applySourceView({
      source,
      boards,
      selectedBoard: selected,
      detail,
      page,
      loading: false,
      error: null,
    });
  } catch (err) {
    if (seq !== loadBoardsSeq || leaderboardState.source !== source) return;
    const msg = err instanceof Error ? err.message : '排行榜加载失败';
    setLeaderboardState({
      loading: false,
      loadingMore: false,
      error: msg,
    });
    notifyPageError('排行榜加载失败', msg);
    if (!options?.replaceOnReady) {
      setLeaderboardState({
        boards: [],
        selectedBoard: null,
        detail: null,
        total: 0,
        hasMore: false,
      });
      sourceCache.delete(source);
    }
  }
}

async function fetchBoardPage(
  board: LeaderboardBoard,
  page: number,
  options: { force?: boolean; append?: boolean },
): Promise<void> {
  const source = leaderboardState.source;
  const force = options.force === true;
  const append = options.append === true;
  const key = detailCacheKey(board.id, page);

  if (!force && !append) {
    const cached = detailCache.get(key);
    if (cached) {
      applySourceView({
        source,
        boards: leaderboardState.boards,
        selectedBoard: board,
        detail: cached,
        page,
        loading: false,
        error: null,
      });
      return;
    }
  }

  const seq = ++loadDetailSeq;
  if (append) {
    setLeaderboardState({
      selectedBoard: board,
      page,
      loadingMore: true,
      error: null,
    });
  } else {
    setLeaderboardState({
      selectedBoard: board,
      page,
      loading: true,
      loadingMore: false,
      error: null,
    });
  }
  sourceCache.set(source, {
    boards: leaderboardState.boards.slice(),
    selectedBoardId: board.id,
    page,
  });

  try {
    const pageDetail = isHubMfSource(source)
      ? await (async () => {
          const pluginId = hubMfPluginId(source) ?? board.mfPluginId;
          const sheet =
            (board.mfSheetItem as MfSheetItem | undefined) ??
            ({ id: board.bangId, platform: pluginId ?? '' } as MfSheetItem);
          if (!pluginId) throw new Error('插件源无效');
          const result = await browseMfTopListDetail(pluginId, sheet, page);
          return {
            board,
            tracks: result.tracks,
            total: result.tracks.length,
            page,
            limit: leaderboardState.limit,
          } satisfies LeaderboardDetail;
        })()
      : await browseLeaderboard(source as MusicSdkSource, board.bangId, page);
    if (seq !== loadDetailSeq || leaderboardState.source !== source) {
      // 已被更新的请求取代：勿清 loading，由当前序号持有者收尾
      return;
    }
    if (leaderboardState.selectedBoard?.id !== board.id) {
      return;
    }

    rememberDetail(pageDetail, page);

    const limit = Math.max(1, pageDetail.limit || leaderboardState.limit || 100);
    const pageTotal = resolvePagingTotal(page, limit, pageDetail.tracks.length, pageDetail.total);

    let tracks: AudioTrack[];
    let total: number;
    if (append && leaderboardState.detail?.board.id === board.id) {
      tracks = [...leaderboardState.detail.tracks, ...pageDetail.tracks];
      total = Math.max(leaderboardState.total, pageTotal, tracks.length);
    } else {
      tracks = pageDetail.tracks;
      total = Math.max(pageTotal, tracks.length);
    }

    const detail: LeaderboardDetail = {
      ...pageDetail,
      tracks,
      total,
      page,
      limit,
    };

    setLeaderboardState({
      detail,
      page,
      total,
      limit,
      hasMore: resolveHasMore(page, limit, pageDetail.tracks.length, total),
      loading: false,
      loadingMore: false,
    });
    rememberSourceSnapshot();
  } catch (err) {
    if (seq !== loadDetailSeq || leaderboardState.source !== source) return;
    if (leaderboardState.selectedBoard?.id !== board.id) return;
    if (!append) detailCache.delete(key);
    const msg = err instanceof Error ? err.message : '榜单曲目加载失败';
    setLeaderboardState({
      loading: false,
      loadingMore: false,
      error: msg,
      ...(append ? {} : { detail: null, hasMore: false, total: 0 }),
    });
    notifyPageError('榜单曲目加载失败', msg);
  }
}

export async function selectLeaderboardBoard(
  board: LeaderboardBoard,
  page = 1,
  options?: { force?: boolean },
): Promise<void> {
  await fetchBoardPage(board, page, { force: options?.force, append: false });
}

/** 分页模式：跳转到指定页（替换列表） */
export async function goToLeaderboardPage(page: number): Promise<void> {
  const board = leaderboardState.selectedBoard;
  if (!board || leaderboardState.loading || leaderboardState.loadingMore) return;
  const next = Math.max(1, Math.floor(page));
  if (next === leaderboardState.page) return;
  await fetchBoardPage(board, next, { append: false });
}

/** 滚动模式：追加下一页 */
export async function loadMoreLeaderboard(): Promise<void> {
  const board = leaderboardState.selectedBoard;
  if (
    !board ||
    leaderboardState.loading ||
    leaderboardState.loadingMore ||
    !leaderboardState.hasMore
  ) {
    return;
  }
  if (getMusicLeaderboardUi().paginationPreference !== 'scroll') return;
  await fetchBoardPage(board, leaderboardState.page + 1, { append: true });
}

/** 强制刷新当前来源榜单列表与当前选中榜详情（回到第 1 页） */
export async function refreshLeaderboard(): Promise<void> {
  const source = leaderboardState.source;
  const selectedId = leaderboardState.selectedBoard?.id ?? null;

  for (const [key, cached] of detailCache) {
    if (cached.board.source === source) {
      detailCache.delete(key);
    }
  }
  sourceCache.delete(source);

  const seq = ++loadBoardsSeq;
  setLeaderboardState({ loading: true, loadingMore: false, error: null });
  try {
    const boards = await fetchLeaderboardBoards(source);
    if (seq !== loadBoardsSeq || leaderboardState.source !== source) return;

    const selected = boardById(boards, selectedId) ?? boards[0] ?? null;
    sourceCache.set(source, {
      boards: boards.slice(),
      selectedBoardId: selected?.id ?? null,
      page: 1,
    });
    setLeaderboardState({ boards, selectedBoard: selected, page: 1 });

    if (selected) {
      await selectLeaderboardBoard(selected, 1, { force: true });
    } else {
      setLeaderboardState({
        detail: null,
        loading: false,
        total: 0,
        hasMore: false,
      });
    }
  } catch (err) {
    if (seq !== loadBoardsSeq || leaderboardState.source !== source) return;
    const msg = err instanceof Error ? err.message : '排行榜刷新失败';
    setLeaderboardState({
      loading: false,
      loadingMore: false,
      error: msg,
    });
    notifyPageError('排行榜刷新失败', msg);
  }
}

export {
  MUSIC_SDK_SOURCES,
  MUSIC_SDK_SOURCE_LABELS,
  listHubLeaderboardSources,
  hubBrowseSourceLabel,
};

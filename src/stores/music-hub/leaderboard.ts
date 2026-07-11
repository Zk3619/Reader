/**
 * Music Hub 排行榜状态
 */

import { createStore } from 'solid-js/store';
import {
  browseLeaderboard,
  getLeaderboardBoards,
  MUSIC_SDK_SOURCE_LABELS,
  MUSIC_SDK_SOURCES,
  type MusicSdkSource,
} from '@/lib/media/audio/music-sdk';
import type { LeaderboardBoard, LeaderboardDetail } from '@/lib/media/audio/music-sdk/types';

export interface MusicHubLeaderboardState {
  source: MusicSdkSource;
  boards: LeaderboardBoard[];
  selectedBoard: LeaderboardBoard | null;
  detail: LeaderboardDetail | null;
  page: number;
  loading: boolean;
  error: string | null;
}

const [leaderboardState, setLeaderboardState] = createStore<MusicHubLeaderboardState>({
  source: 'wy',
  boards: [],
  selectedBoard: null,
  detail: null,
  page: 1,
  loading: false,
  error: null,
});

export function getLeaderboardState(): MusicHubLeaderboardState {
  return leaderboardState;
}

export function setLeaderboardSource(source: MusicSdkSource): void {
  setLeaderboardState({
    source,
    selectedBoard: null,
    detail: null,
    page: 1,
    error: null,
  });
  void loadLeaderboardBoards();
}

export async function loadLeaderboardBoards(): Promise<void> {
  setLeaderboardState({ loading: true, error: null });
  try {
    const boards = await getLeaderboardBoards(leaderboardState.source);
    setLeaderboardState({ boards, loading: false });
  } catch (err) {
    setLeaderboardState({
      loading: false,
      error: err instanceof Error ? err.message : '排行榜加载失败',
      boards: [],
    });
  }
}

export async function selectLeaderboardBoard(board: LeaderboardBoard, page = 1): Promise<void> {
  setLeaderboardState({ selectedBoard: board, page, loading: true, error: null });
  try {
    const detail = await browseLeaderboard(leaderboardState.source, board.bangId, page);
    setLeaderboardState({ detail, loading: false });
  } catch (err) {
    setLeaderboardState({
      loading: false,
      error: err instanceof Error ? err.message : '榜单曲目加载失败',
      detail: null,
    });
  }
}

export { MUSIC_SDK_SOURCES, MUSIC_SDK_SOURCE_LABELS };

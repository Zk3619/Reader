/**
 * 影视播放页 UI 偏好
 */

import { createStore } from 'solid-js/store';

export interface TvPlayUiState {
  /** 隐藏主壳 PageToolbar，改用播放器叠层顶栏 */
  hideHeader: boolean;
  /** 离开播放页（含切壳）时以主壳迷你窗续播 */
  miniPlayerEnabled: boolean;
}

const STORAGE_KEY = 'tv_play_ui_v1';

const DEFAULTS: TvPlayUiState = {
  hideHeader: false,
  miniPlayerEnabled: true,
};

function loadUiState(): TvPlayUiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<TvPlayUiState>;
    return {
      hideHeader: parsed.hideHeader === true,
      miniPlayerEnabled: parsed.miniPlayerEnabled !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(next: TvPlayUiState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
}

const [state, setState] = createStore<TvPlayUiState>(loadUiState());

export function getTvPlayUiState(): TvPlayUiState {
  return state;
}

function write(patch: Partial<TvPlayUiState>): TvPlayUiState {
  const next: TvPlayUiState = {
    hideHeader: patch.hideHeader ?? state.hideHeader,
    miniPlayerEnabled: patch.miniPlayerEnabled ?? state.miniPlayerEnabled,
  };
  setState(next);
  persist(next);
  return next;
}

export function setTvPlayHideHeader(hideHeader: boolean): void {
  write({ hideHeader });
}

export function toggleTvPlayHideHeader(): void {
  setTvPlayHideHeader(!state.hideHeader);
}

export function isTvMiniPlayerEnabled(): boolean {
  return state.miniPlayerEnabled !== false;
}

export function setTvMiniPlayerEnabled(enabled: boolean): void {
  write({ miniPlayerEnabled: enabled });
  if (!enabled) {
    void import('@/stores/tv-mini-player').then((m) => {
      if (m.tvMiniPlayerStore.isActive()) m.tvMiniPlayerStore.closeMini();
    });
  }
}

/**
 * 影视播放页 UI 偏好
 */

import { createStore } from 'solid-js/store';

export interface TvPlayUiState {
  /** 隐藏主壳 PageToolbar，改用播放器叠层顶栏 */
  hideHeader: boolean;
}

const STORAGE_KEY = 'tv_play_ui_v1';

function loadUiState(): TvPlayUiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { hideHeader: false };
    const parsed = JSON.parse(raw) as Partial<TvPlayUiState>;
    return { hideHeader: parsed.hideHeader === true };
  } catch {
    return { hideHeader: false };
  }
}

function persist(state: TvPlayUiState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* */
  }
}

const [state, setState] = createStore<TvPlayUiState>(loadUiState());

export function getTvPlayUiState(): TvPlayUiState {
  return state;
}

export function setTvPlayHideHeader(hideHeader: boolean): void {
  setState('hideHeader', hideHeader);
  persist({ hideHeader });
}

export function toggleTvPlayHideHeader(): void {
  setTvPlayHideHeader(!state.hideHeader);
}

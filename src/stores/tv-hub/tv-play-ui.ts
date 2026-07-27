/**
 * 影视播放页 UI 偏好
 */

import { createStore } from 'solid-js/store';

export interface TvPlayUiState {
  /** 隐藏主壳 PageToolbar，改用播放器叠层顶栏 */
  hideHeader: boolean;
  /** 离开播放页（含切壳）时以主壳迷你窗续播 */
  miniPlayerEnabled: boolean;
  /**
   * 聚合播放：藏主壳顶栏与播放器下方控制区，
   * 线路/解析/选集等改到播放器弹层
   */
  aggregatedPlay: boolean;
  /** 有多线路的 VOD：播放失败时自动切下一线路（默认开，对齐既有回退） */
  autoSwitchFlagOnError: boolean;
}

/** v2：兼容旧字段；新增 aggregatedPlay / autoSwitchFlagOnError */
const STORAGE_KEY = 'tv_play_ui_v2';
const LEGACY_STORAGE_KEY = 'tv_play_ui_v1';

const DEFAULTS: TvPlayUiState = {
  hideHeader: false,
  miniPlayerEnabled: true,
  aggregatedPlay: false,
  autoSwitchFlagOnError: true,
};

function loadUiState(): TvPlayUiState {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<TvPlayUiState>;
    return {
      hideHeader: parsed.hideHeader === true,
      miniPlayerEnabled: parsed.miniPlayerEnabled !== false,
      aggregatedPlay: parsed.aggregatedPlay === true,
      autoSwitchFlagOnError: parsed.autoSwitchFlagOnError !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(next: TvPlayUiState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        hideHeader: next.hideHeader === true,
        miniPlayerEnabled: next.miniPlayerEnabled !== false,
        aggregatedPlay: next.aggregatedPlay === true,
        autoSwitchFlagOnError: next.autoSwitchFlagOnError !== false,
      }),
    );
    localStorage.removeItem(LEGACY_STORAGE_KEY);
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
    aggregatedPlay: patch.aggregatedPlay ?? state.aggregatedPlay,
    autoSwitchFlagOnError: patch.autoSwitchFlagOnError ?? state.autoSwitchFlagOnError,
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

export function setTvPlayAggregated(aggregatedPlay: boolean): void {
  // 聚合模式强制沉浸顶栏
  write(aggregatedPlay ? { aggregatedPlay: true, hideHeader: true } : { aggregatedPlay: false });
}

export function toggleTvPlayAggregated(): void {
  setTvPlayAggregated(!state.aggregatedPlay);
}

export function isTvAutoSwitchFlagOnError(): boolean {
  return state.autoSwitchFlagOnError !== false;
}

export function setTvAutoSwitchFlagOnError(enabled: boolean): void {
  write({ autoSwitchFlagOnError: enabled });
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

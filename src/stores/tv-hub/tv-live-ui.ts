/**
 * 直播页 UI / 行为偏好（对齐 TV-fongmi LiveSetting 子集）
 */

import { createStore } from 'solid-js/store';

export interface TvLiveUiState {
  /** 默认直播源名称（空=配置顺序第一个） */
  homeSourceName: string;
  /** 换台是否跨分组（across） */
  across: boolean;
  /** 播放失败是否自动切线路（change） */
  change: boolean;
  /** 上次观看：source|group|channel|lineIndex */
  lastKeep: string;
}

const STORAGE_KEY = 'tv_live_ui_v1';

function loadUiState(): TvLiveUiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { homeSourceName: '', across: true, change: true, lastKeep: '' };
    }
    const parsed = JSON.parse(raw) as Partial<TvLiveUiState>;
    return {
      homeSourceName: typeof parsed.homeSourceName === 'string' ? parsed.homeSourceName : '',
      across: parsed.across !== false,
      change: parsed.change !== false,
      lastKeep: typeof parsed.lastKeep === 'string' ? parsed.lastKeep : '',
    };
  } catch {
    return { homeSourceName: '', across: true, change: true, lastKeep: '' };
  }
}

function persist(state: TvLiveUiState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* */
  }
}

const [tvLiveUi, setTvLiveUi] = createStore<TvLiveUiState>(loadUiState());

export function getTvLiveUi(): TvLiveUiState {
  return tvLiveUi;
}

export function setTvLiveHomeSourceName(name: string): void {
  setTvLiveUi('homeSourceName', name);
  persist(tvLiveUi);
}

export function setTvLiveAcross(across: boolean): void {
  setTvLiveUi('across', across);
  persist(tvLiveUi);
}

export function setTvLiveChange(change: boolean): void {
  setTvLiveUi('change', change);
  persist(tvLiveUi);
}

export function setTvLiveLastKeep(keep: string): void {
  setTvLiveUi('lastKeep', keep);
  persist(tvLiveUi);
}

export function encodeLiveKeep(
  source: string,
  group: string,
  channel: string,
  lineIndex: number,
): string {
  return [source, group, channel, String(lineIndex)].join('|');
}

export function decodeLiveKeep(
  keep: string,
): { source: string; group: string; channel: string; lineIndex: number } | null {
  const parts = keep.split('|');
  if (parts.length < 3) return null;
  const lineIndex = parts.length >= 4 ? Number(parts[3]) : 0;
  return {
    source: parts[0] ?? '',
    group: parts[1] ?? '',
    channel: parts[2] ?? '',
    lineIndex: Number.isFinite(lineIndex) ? Math.max(0, Math.floor(lineIndex)) : 0,
  };
}

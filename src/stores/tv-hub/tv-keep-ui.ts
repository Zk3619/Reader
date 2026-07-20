/**
 * 影视收藏页 UI 偏好：布局 / 分组导航 / 搜索匹配
 */

import { createStore } from 'solid-js/store';
import {
  gridViewModeOptions,
  isGridViewMode,
  isListViewMode,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import { MediaGroupId, isVideoSystemGroupId } from '@/types/book-group';

/** 对齐书架 groupStyle：标签 / 工具栏下拉 / 标题下拉 */
export type TvKeepGroupStyle = 'tabs' | 'select' | 'dropdown';

/** 收藏内搜索：精确（包含）/ 模糊（字符序） */
export type TvKeepMatchMode = 'exact' | 'fuzzy';

export interface TvKeepUiState {
  groupStyle: TvKeepGroupStyle;
  activeGroupId: number;
  viewMode: ViewMode;
  spacing: number;
  matchMode: TvKeepMatchMode;
}

const STORAGE_KEY = 'tv_keep_ui_v4';
const ALLOWED_VIEW_MODES = new Set<string>([
  'list',
  'list-2',
  'list-3',
  ...gridViewModeOptions.map((o) => o.value),
]);

function isGroupStyle(v: unknown): v is TvKeepGroupStyle {
  return v === 'tabs' || v === 'select' || v === 'dropdown';
}

function isMatchMode(v: unknown): v is TvKeepMatchMode {
  return v === 'exact' || v === 'fuzzy';
}

function normalizeViewMode(v: unknown): ViewMode {
  if (typeof v === 'string' && ALLOWED_VIEW_MODES.has(v)) {
    if (isListViewMode(v) || isGridViewMode(v)) return v as ViewMode;
  }
  return 'grid-4';
}

function normalizeSpacing(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 12;
  return Math.max(0, Math.min(24, Math.round(v)));
}

function normalizeGroupId(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return MediaGroupId.VideoAll;
  const id = Math.trunc(v);
  if (id === MediaGroupId.VideoKeep || id === MediaGroupId.VideoRecent) {
    return MediaGroupId.VideoAll;
  }
  return id;
}

function migrateGroupStyle(parsed: Record<string, unknown>): TvKeepGroupStyle {
  if (isGroupStyle(parsed.groupStyle)) return parsed.groupStyle;
  // v3 filterControl
  if (parsed.filterControl === 'select') return 'select';
  if (parsed.filterControl === 'tabs') return 'tabs';
  return 'tabs';
}

function loadUiState(): TvKeepUiState {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem('tv_keep_ui_v3') ??
      localStorage.getItem('tv_keep_ui_v2') ??
      localStorage.getItem('tv_keep_ui_v1');
    if (!raw) {
      return {
        groupStyle: 'tabs',
        activeGroupId: MediaGroupId.VideoAll,
        viewMode: 'grid-4',
        spacing: 12,
        matchMode: 'exact',
      };
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      groupStyle: migrateGroupStyle(parsed),
      activeGroupId: normalizeGroupId(parsed.activeGroupId),
      viewMode: normalizeViewMode(parsed.viewMode),
      spacing: normalizeSpacing(parsed.spacing),
      matchMode: isMatchMode(parsed.matchMode) ? parsed.matchMode : 'exact',
    };
  } catch {
    return {
      groupStyle: 'tabs',
      activeGroupId: MediaGroupId.VideoAll,
      viewMode: 'grid-4',
      spacing: 12,
      matchMode: 'exact',
    };
  }
}

function persist(state: TvKeepUiState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* */
  }
}

const [tvKeepUi, setTvKeepUi] = createStore<TvKeepUiState>(loadUiState());

export function getTvKeepUi(): TvKeepUiState {
  return tvKeepUi;
}

/** @deprecated 使用 setTvKeepGroupStyle */
export function setTvKeepFilterControl(style: TvKeepGroupStyle): void {
  setTvKeepGroupStyle(style);
}

export function setTvKeepGroupStyle(style: TvKeepGroupStyle): void {
  if (!isGroupStyle(style)) return;
  setTvKeepUi('groupStyle', style);
  persist(tvKeepUi);
}

export function setTvKeepActiveGroupId(groupId: number): void {
  setTvKeepUi('activeGroupId', normalizeGroupId(groupId));
  persist(tvKeepUi);
}

export function setTvKeepMatchMode(mode: TvKeepMatchMode): void {
  if (!isMatchMode(mode)) return;
  setTvKeepUi('matchMode', mode);
  persist(tvKeepUi);
}

export function updateTvKeepLayout(
  patch: Partial<Pick<TvKeepUiState, 'viewMode' | 'spacing' | 'groupStyle'>>,
): void {
  if (patch.viewMode != null) setTvKeepUi('viewMode', normalizeViewMode(patch.viewMode));
  if (patch.spacing != null) setTvKeepUi('spacing', normalizeSpacing(patch.spacing));
  if (patch.groupStyle != null && isGroupStyle(patch.groupStyle)) {
    setTvKeepUi('groupStyle', patch.groupStyle);
  }
  persist(tvKeepUi);
}

export function isTvKeepNavGroupId(groupId: number): boolean {
  return isVideoSystemGroupId(groupId) || groupId < MediaGroupId.VideoUserStart;
}

/** 当前分组内片名匹配（精确=包含；模糊=字符序） */
export function filterTvKeepByQuery<T extends { vodName: string; siteKey?: string; vodId?: string }>(
  rows: readonly T[],
  keyword: string,
  mode: TvKeepMatchMode,
): T[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((row) => {
    const name = (row.vodName ?? '').trim().toLowerCase();
    const hay = `${name} ${(row.siteKey ?? '').toLowerCase()} ${(row.vodId ?? '').toLowerCase()}`;
    if (!hay.trim()) return false;
    if (mode === 'exact') return hay.includes(q);
    let i = 0;
    for (const ch of hay) {
      if (ch === q[i]) {
        i += 1;
        if (i >= q.length) return true;
      }
    }
    return false;
  });
}

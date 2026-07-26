/**
 * 影视首页 UI 偏好：筛选控件风格 + 书架式布局（固定列数 viewMode + spacing）
 */

import { createStore } from 'solid-js/store';
import {
  gridViewModeOptions,
  isGridViewMode,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import {
  isHubTagStackChipDensity,
  type HubTagStackChipDensity,
} from '@/lib/ui/hub-tag-stack-styles';

export type TvHomeSelectControlStyle = 'select' | 'tabs';
export type TvHomeTagControlStyle = 'grouped' | 'stacked';
/** 对齐音乐搜索/歌单：滚动追加 / 分页切换 */
export type TvHomePaginationPreference = 'scroll' | 'pagination';
export type { HubTagStackChipDensity as TvHomeTagStackDensity };

export interface TvHomeUiState {
  siteControl: TvHomeSelectControlStyle;
  classControl: TvHomeTagControlStyle;
  filterControl: TvHomeTagControlStyle;
  /** 徽标堆叠芯片密度（分类/筛选共用） */
  tagStackDensity: HubTagStackChipDensity;
  /** 列表翻页方式 */
  paginationPreference: TvHomePaginationPreference;
  /** 网格列数（与书架 grid-N 一致） */
  viewMode: ViewMode;
  /** 间距 0–24（×0.25rem，对齐书架） */
  spacing: number;
  /** 各站点上次选中的分类 type_id（切回源时恢复） */
  siteLastTid: Record<string, string>;
}

const STORAGE_KEY = 'tv_home_ui_v1';

const ALLOWED_GRID = new Set(gridViewModeOptions.map((o) => o.value));

function isSelectStyle(v: unknown): v is TvHomeSelectControlStyle {
  return v === 'select' || v === 'tabs';
}

function isTagStyle(v: unknown): v is TvHomeTagControlStyle {
  return v === 'grouped' || v === 'stacked';
}

function normalizeViewMode(v: unknown): ViewMode {
  if (typeof v === 'string' && ALLOWED_GRID.has(v as ViewMode) && isGridViewMode(v)) {
    return v as ViewMode;
  }
  // 旧版 cardSize → 近似列数
  if (v === 'xs' || v === 'sm') return 'grid-6';
  if (v === 'md') return 'grid-4';
  if (v === 'lg' || v === 'xl') return 'grid-3';
  return 'grid-4';
}

function normalizeSpacing(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 12;
  return Math.max(0, Math.min(24, Math.round(v)));
}

function normalizeSiteLastTid(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof k === 'string' && k && typeof val === 'string' && val) {
      out[k] = val;
    }
  }
  return out;
}

function isPaginationPreference(v: unknown): v is TvHomePaginationPreference {
  return v === 'scroll' || v === 'pagination';
}

function loadUiState(): TvHomeUiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        siteControl: 'select',
        classControl: 'grouped',
        filterControl: 'grouped',
        tagStackDensity: 'comfortable',
        paginationPreference: 'pagination',
        viewMode: 'grid-4',
        spacing: 12,
        siteLastTid: {},
      };
    }
    const parsed = JSON.parse(raw) as Partial<TvHomeUiState> & { cardSize?: unknown };
    return {
      siteControl: isSelectStyle(parsed.siteControl) ? parsed.siteControl : 'select',
      classControl: isTagStyle(parsed.classControl) ? parsed.classControl : 'grouped',
      filterControl: isTagStyle(parsed.filterControl) ? parsed.filterControl : 'grouped',
      tagStackDensity: isHubTagStackChipDensity(parsed.tagStackDensity)
        ? parsed.tagStackDensity
        : 'comfortable',
      paginationPreference: isPaginationPreference(parsed.paginationPreference)
        ? parsed.paginationPreference
        : 'pagination',
      viewMode: normalizeViewMode(parsed.viewMode ?? parsed.cardSize),
      spacing: normalizeSpacing(parsed.spacing),
      siteLastTid: normalizeSiteLastTid(parsed.siteLastTid),
    };
  } catch {
    return {
      siteControl: 'select',
      classControl: 'grouped',
      filterControl: 'grouped',
      tagStackDensity: 'comfortable',
      paginationPreference: 'pagination',
      viewMode: 'grid-4',
      spacing: 12,
      siteLastTid: {},
    };
  }
}

function persist(state: TvHomeUiState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* */
  }
}

const [tvHomeUi, setTvHomeUi] = createStore<TvHomeUiState>(loadUiState());

export function getTvHomeUi(): TvHomeUiState {
  return tvHomeUi;
}

export function setTvHomeSiteControl(style: TvHomeSelectControlStyle): void {
  setTvHomeUi('siteControl', style);
  persist(tvHomeUi);
}

export function setTvHomeClassControl(style: TvHomeTagControlStyle): void {
  setTvHomeUi('classControl', style);
  persist(tvHomeUi);
}

export function setTvHomeFilterControl(style: TvHomeTagControlStyle): void {
  setTvHomeUi('filterControl', style);
  persist(tvHomeUi);
}

export function setTvHomeTagStackDensity(density: HubTagStackChipDensity): void {
  setTvHomeUi('tagStackDensity', density);
  persist(tvHomeUi);
}

export function setTvHomePaginationPreference(preference: TvHomePaginationPreference): void {
  setTvHomeUi('paginationPreference', preference);
  persist(tvHomeUi);
}

export function updateTvHomeLayout(patch: Partial<Pick<TvHomeUiState, 'viewMode' | 'spacing'>>): void {
  if (patch.viewMode != null) setTvHomeUi('viewMode', normalizeViewMode(patch.viewMode));
  if (patch.spacing != null) setTvHomeUi('spacing', normalizeSpacing(patch.spacing));
  persist(tvHomeUi);
}

export function getTvHomeSiteLastTid(siteKey: string): string | undefined {
  if (!siteKey) return undefined;
  const tid = tvHomeUi.siteLastTid[siteKey];
  return typeof tid === 'string' && tid ? tid : undefined;
}

export function setTvHomeSiteLastTid(siteKey: string, tid: string): void {
  if (!siteKey || !tid) return;
  setTvHomeUi('siteLastTid', siteKey, tid);
  persist(tvHomeUi);
}

/**
 * 探索页布局设置（与书架 groupStyle 独立）
 */

import { createStore } from 'solid-js/store';
import { getStorage, setStorage } from '@/lib/platform/storage';
import type { ViewMode } from '@/lib/bookshelf/bookshelf-layout-settings';

export const EXPLORE_PAGINATION_PREFERENCE_KEY = 'explore_pagination_preference';

export type ExploreSectionDisplayStyle = 'stacked' | 'tabs';
export type ExploreDataDisplayMode = 'detailed' | 'compact';
export type ExploreDataLayoutMode = 'default' | 'text-list' | 'card-list' | 'card-grid';
export type ExplorePaginationPreference = 'scroll' | 'pagination';
/** 书源切换方式：标题下拉 / 标签栏 / 弹窗列表 */
export type ExploreSourceNavStyle = 'dropdown' | 'tabs' | 'dialog';

export interface ExplorePageLayoutSettings {
  /** 书源切换展示方式（互斥） */
  sourceNavStyle: ExploreSourceNavStyle;
  /** 分类展示：堆叠 / Tab 标签 */
  sectionDisplayStyle: ExploreSectionDisplayStyle;
  /** 数据展示：详细 / 精简 */
  dataDisplayMode: ExploreDataDisplayMode;
  /** 是否显示封面（卡片列表 / 卡片网格） */
  showCover: boolean;
  /** 分页偏好：滚动加载 / 分页列表 */
  paginationPreference: ExplorePaginationPreference;
  /** 数据布局：默认 / 文本列表 / 卡片列表 / 卡片网格 */
  dataLayoutMode: ExploreDataLayoutMode;
  /** 卡片列表视图（与书架列表一致） */
  cardListViewMode: ViewMode;
  /** 卡片网格视图（与书架网格一致） */
  cardGridViewMode: ViewMode;
  /** 卡片列表 / 网格间距（与书架 spacing 语义一致） */
  spacing: number;
}

/** 旧版单选样式，仅用于迁移 */
type LegacySourceNavStyle = 'normal' | 'dropdown' | 'tabs';

type StoredExplorePageLayout = Partial<ExplorePageLayoutSettings> & {
  sourceNavStyle?: ExploreSourceNavStyle | LegacySourceNavStyle;
  /** 旧版存储：迁移至 sourceNavStyle */
  sourceDropdownEnabled?: boolean;
  /** 旧版存储：迁移至 sourceNavStyle */
  sourceTabsEnabled?: boolean;
};

export const defaultExplorePageLayoutSettings: ExplorePageLayoutSettings = {
  sourceNavStyle: 'tabs',
  sectionDisplayStyle: 'stacked',
  dataDisplayMode: 'detailed',
  showCover: true,
  paginationPreference: 'scroll',
  dataLayoutMode: 'default',
  cardListViewMode: 'list',
  cardGridViewMode: 'grid-4',
  spacing: 12,
};

const STORAGE_KEY = 'explore-page-layout-settings';

function isListViewMode(mode: string): boolean {
  return (
    mode === 'list' ||
    mode === 'list-2' ||
    mode === 'list-3' ||
    mode === 'compact' ||
    mode === 'compact-2' ||
    mode === 'compact-3'
  );
}

function isGridViewMode(mode: string): boolean {
  return mode.startsWith('grid-');
}

function normalizeViewMode(mode: unknown, fallback: ViewMode): ViewMode {
  if (typeof mode !== 'string') return fallback;
  if (isListViewMode(mode) || isGridViewMode(mode)) return mode as ViewMode;
  return fallback;
}

function resolveSourceNavStyle(saved: StoredExplorePageLayout): ExploreSourceNavStyle {
  const style = saved.sourceNavStyle;
  if (style === 'dropdown' || style === 'tabs' || style === 'dialog') return style;
  if (style === 'normal') return 'tabs';

  if (typeof saved.sourceDropdownEnabled === 'boolean' || typeof saved.sourceTabsEnabled === 'boolean') {
    const dropdown = saved.sourceDropdownEnabled ?? false;
    const tabs = saved.sourceTabsEnabled ?? false;
    if (dropdown && !tabs) return 'dropdown';
    if (tabs && !dropdown) return 'tabs';
    if (dropdown && tabs) return 'dropdown';
    return 'tabs';
  }

  return defaultExplorePageLayoutSettings.sourceNavStyle;
}

function normalizeSettings(saved: StoredExplorePageLayout | null): ExplorePageLayoutSettings {
  if (!saved) return defaultExplorePageLayoutSettings;

  const sourceNavStyle = resolveSourceNavStyle(saved);
  const sectionDisplayStyle =
    saved.sectionDisplayStyle === 'tabs' ? 'tabs' : 'stacked';
  const dataDisplayMode =
    saved.dataDisplayMode === 'compact' ? 'compact' : 'detailed';
  const layoutModes: ExploreDataLayoutMode[] = [
    'default',
    'text-list',
    'card-list',
    'card-grid',
  ];
  const dataLayoutMode = layoutModes.includes(saved.dataLayoutMode as ExploreDataLayoutMode)
    ? (saved.dataLayoutMode as ExploreDataLayoutMode)
    : 'default';
  const paginationPreference =
    saved.paginationPreference === 'pagination' ? 'pagination' : 'scroll';

  return {
    sourceNavStyle,
    sectionDisplayStyle,
    dataDisplayMode,
    showCover: saved.showCover ?? true,
    paginationPreference,
    dataLayoutMode,
    cardListViewMode: normalizeViewMode(saved.cardListViewMode, 'list'),
    cardGridViewMode: normalizeViewMode(saved.cardGridViewMode, 'grid-4'),
    spacing:
      typeof saved.spacing === 'number' && saved.spacing >= 0 && saved.spacing <= 24
        ? saved.spacing
        : defaultExplorePageLayoutSettings.spacing,
  };
}

async function loadSettings(): Promise<ExplorePageLayoutSettings> {
  try {
    const saved = await getStorage<StoredExplorePageLayout>(STORAGE_KEY);
    let settings = normalizeSettings(saved);

    if (saved?.paginationPreference == null) {
      const legacyPagination = await getStorage<ExplorePaginationPreference>(
        EXPLORE_PAGINATION_PREFERENCE_KEY,
      );
      if (legacyPagination === 'scroll' || legacyPagination === 'pagination') {
        settings = { ...settings, paginationPreference: legacyPagination };
      }
    }

    return settings;
  } catch (error) {
    console.warn('[探索页布局] 加载设置失败，使用默认设置:', error);
  }
  return defaultExplorePageLayoutSettings;
}

async function saveSettings(settings: ExplorePageLayoutSettings): Promise<void> {
  try {
    await setStorage(STORAGE_KEY, settings);
    await setStorage(EXPLORE_PAGINATION_PREFERENCE_KEY, settings.paginationPreference);
  } catch (error) {
    console.error('[探索页布局] 保存设置失败:', error);
  }
}

const [settings, setSettings] = createStore<ExplorePageLayoutSettings>(
  defaultExplorePageLayoutSettings,
);

let initialized = false;
export async function initExplorePageLayoutSettings(): Promise<void> {
  if (initialized) return;
  const loaded = await loadSettings();
  setSettings(loaded);
  initialized = true;
}

export const explorePageLayoutStore = {
  get settings() {
    return settings;
  },

  updateSettings(updates: Partial<ExplorePageLayoutSettings>): void {
    const merged = { ...settings, ...updates };
    setSettings(merged);
    saveSettings(merged).catch(console.error);
  },
};

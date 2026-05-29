/**
 * 书架布局设置 Store
 * 管理书架和分组的布局设置
 */

import { createStore } from 'solid-js/store';
import {
  defaultBookshelfLayoutSettings,
  getViewModeGridColumnCount,
  isGridViewMode,
  isListViewMode,
  type BookshelfLayoutSettings,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import {
  loadBookshelfPageLayoutSettings,
  saveBookshelfPageLayoutSettings,
} from '@/lib/search/search-prefs';

export type {
  BookTitleDisplay,
  BookshelfLayoutSettings,
  GroupStyle,
  SortMode,
  ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';

export { defaultBookshelfLayoutSettings } from '@/lib/bookshelf/bookshelf-layout-settings';

/**
 * 从存储加载设置
 */
async function loadSettings(): Promise<BookshelfLayoutSettings> {
  try {
    return await loadBookshelfPageLayoutSettings();
  } catch (error) {
    console.warn('[书架布局] 加载设置失败，使用默认设置:', error);
    return defaultBookshelfLayoutSettings;
  }
}

/**
 * 保存设置到存储
 */
async function saveSettings(settings: BookshelfLayoutSettings): Promise<void> {
  try {
    await saveBookshelfPageLayoutSettings(settings);
  } catch (error) {
    console.error('[书架布局] 保存设置失败:', error);
  }
}

/**
 * 创建书架布局 Store
 */
const [settings, setSettings] = createStore<BookshelfLayoutSettings>(
  defaultBookshelfLayoutSettings,
);

/**
 * 初始化设置（从存储加载）
 */
let initialized = false;
export async function initBookshelfLayoutSettings(): Promise<void> {
  if (initialized) return;

  const loaded = await loadSettings();
  setSettings(loaded);
  initialized = true;
}

/**
 * 书架布局 Store
 */
export const bookshelfLayoutStore = {
  /** 获取设置 */
  get settings() {
    return settings;
  },

  /**
   * 更新设置
   */
  updateSettings(updates: Partial<BookshelfLayoutSettings>): void {
    setSettings(updates);
    saveSettings({ ...settings, ...updates }).catch(console.error);
  },

  /**
   * 重置为默认设置
   */
  resetToDefault(): void {
    setSettings(defaultBookshelfLayoutSettings);
    saveSettings(defaultBookshelfLayoutSettings).catch(console.error);
  },

  /**
   * 获取视图模式的网格列数
   */
  getGridColumns(): number {
    return getViewModeGridColumnCount(settings.viewMode);
  },

  /**
   * 是否为列表视图
   */
  isListView(): boolean {
    return isListViewMode(settings.viewMode);
  },

  /**
   * 是否为网格视图
   */
  isGridView(): boolean {
    return isGridViewMode(settings.viewMode);
  },
};

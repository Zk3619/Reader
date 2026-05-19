/**
 * 书架布局设置 Store
 * 管理书架和分组的布局设置
 */

import { createStore } from 'solid-js/store';
import { getStorage, setStorage } from '@/lib/platform/storage';
import {
  getViewModeGridColumnCount,
  isGridViewMode,
  isListViewMode,
} from '@/utils/bookshelf-view-mode';

/**
 * 分组样式
 */
export type GroupStyle = 'dropdown' | 'tabs' | 'normal';

/**
 * 视图模式
 */
export type ViewMode =
  | 'list'
  | 'list-2'
  | 'list-3'
  | 'compact'
  | 'compact-2'
  | 'compact-3'
  | 'grid-2'
  | 'grid-3'
  | 'grid-4'
  | 'grid-5'
  | 'grid-6'
  | 'grid-7'
  | 'grid-8';

/**
 * 排序方式
 */
export type SortMode = 'read-time' | 'update-time' | 'book-name' | 'manual' | 'comprehensive' | 'author';

/**
 * 书名/分组名显示方式
 */
export type BookTitleDisplay = 'show' | 'hide' | 'overlay';

/**
 * 书架布局设置
 */
export interface BookshelfLayoutSettings {
  /** 分组样式 */
  groupStyle: GroupStyle;
  /** 视图模式 */
  viewMode: ViewMode;
  /** 排序方式 */
  sortMode: SortMode;
  /** 书名/分组名显示方式 */
  bookTitleDisplay: BookTitleDisplay;
  /** 列表/网格间距（0–24，实际 gap = spacing × 0.25rem） */
  spacing: number;
  /** 显示未读标志 */
  showUnreadFlag: boolean;
  /** 显示上次更新时间 */
  showLastUpdateTime: boolean;
  /** 显示等待更新数量 */
  showPendingUpdateCount: boolean;
  /** 显示快速滚动条 */
  showQuickScrollbar: boolean;
}

/**
 * 默认布局设置
 */
const defaultSettings: BookshelfLayoutSettings = {
  groupStyle: 'normal',
  viewMode: 'grid-4',
  sortMode: 'read-time',
  bookTitleDisplay: 'show',
  spacing: 12,
  showUnreadFlag: true,
  showLastUpdateTime: true,
  showPendingUpdateCount: false,
  showQuickScrollbar: false,
};

/**
 * 存储键名
 */
const STORAGE_KEY = 'bookshelf-layout-settings';

/**
 * 从存储加载设置
 */
async function loadSettings(): Promise<BookshelfLayoutSettings> {
  try {
    const saved = await getStorage<BookshelfLayoutSettings>(STORAGE_KEY);
    if (saved) {
      return { ...defaultSettings, ...saved };
    }
  } catch (error) {
    console.warn('[书架布局] 加载设置失败，使用默认设置:', error);
  }
  return defaultSettings;
}

/**
 * 保存设置到存储
 */
async function saveSettings(settings: BookshelfLayoutSettings): Promise<void> {
  try {
    await setStorage(STORAGE_KEY, settings);
  } catch (error) {
    console.error('[书架布局] 保存设置失败:', error);
  }
}

/**
 * 创建书架布局 Store
 */
const [settings, setSettings] = createStore<BookshelfLayoutSettings>(defaultSettings);

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
    // 异步保存到存储
    saveSettings({ ...settings, ...updates }).catch(console.error);
  },

  /**
   * 重置为默认设置
   */
  resetToDefault(): void {
    setSettings(defaultSettings);
    saveSettings(defaultSettings).catch(console.error);
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

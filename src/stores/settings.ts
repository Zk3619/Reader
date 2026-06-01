/**
 * 设置状态管理
 * 对应 legado 项目的设置相关功能
 * 
 * 功能：
 * 1. 管理应用设置
 * 2. 管理阅读设置
 * 3. 管理主题设置
 * 4. 持久化设置到本地存储
 */

import { createStore } from 'solid-js/store';
import type { ShellLayoutPreference } from '@/lib/shell/layout';
import {
  onInnerWebSessionEnded,
  resetInnerWebPanelRuntimeAvailability,
} from '@/lib/platform/inner-web-mode';
import { getStorage, setStorage } from '@/lib/platform/storage';

/**
 * 应用设置接口
 */
export interface AppSettings {
  /** 主题：light | dark | auto */
  theme: 'light' | 'dark' | 'auto';
  /** 语言 */
  language: string;
  /** 自动启动 */
  autoStart: boolean;
  /** 最小化到托盘 */
  minimizeToTray: boolean;
  /** 关闭到托盘 */
  closeToTray: boolean;
  /** 启动时恢复窗口状态 */
  restoreWindowState: boolean;
  /** 减少动效（无障碍 / 偏好） */
  reduceMotion: boolean;
  /**
   * 宽屏（≥480px）下的壳层布局：桌面、移动，或自动（按运行环境）。
   * 仅移动端且宽度不足 480px 时强制使用底栏。
   */
  shellLayout?: ShellLayoutPreference;
  /** 书籍存储目录（首次导入时设置，path: 兼容字段） */
  booksDirectory?: string;
  /** 书籍库根 StorageRef 字符串（path: / saf-tree: / opfs: / handle:dir:） */
  booksStorageRoot?: string;
  /** 是否已设置书籍目录 */
  booksDirectorySet?: boolean;
  /** 封面缓存目录（可选；未设置则用数据根目录下的 cover-cache） */
  coverCacheDirectory?: string;
  /** 是否已自定义封面缓存目录 */
  coverCacheDirectorySet?: boolean;
  /** 导入书籍时的操作偏好：copy / move / none（不写入书籍库，保留原位置） */
  importBookAction?: 'copy' | 'move' | 'none';
  /** 是否记住导入操作偏好 */
  rememberImportAction?: boolean;
  /** 删除书籍时是否删除本地文件 */
  deleteFileAction?: boolean;
  /** 是否记住删除文件操作偏好 */
  rememberDeleteFileAction?: boolean;
  /** 导入时如果文件已存在，操作方式：replace（替换）、skip（跳过）、restore-existing（恢复已存在的书籍）或 rename-import（重命名导入） */
  replaceExistingFile?: 'replace' | 'skip' | 'restore-existing' | 'rename-import';
  /** 是否记住文件替换操作偏好 */
  rememberReplaceFile?: boolean;
  /** 导入书源时保留本地名称（对齐 Legado importKeepName） */
  importKeepName?: boolean;
  /** 导入书源时保留本地分组（对齐 Legado importKeepGroup） */
  importKeepGroup?: boolean;
  /** 导入书源时保留本地启用/发现状态（对齐 Legado importKeepEnable） */
  importKeepEnable?: boolean;
  /** 目录分页安全阈值开关（超限中止，避免 nextTocUrl 死循环） */
  tocPaginationSafetyEnabled?: boolean;
  /** 目录分页最大抓取页数（含第一页） */
  tocPaginationMaxPages?: number;
  /** 书籍详情展示方式：独立全屏页或右侧抽屉 */
  bookInfoPresentation?: 'page' | 'drawer';
  /**
   * Tauri 桌面内嵌网页承载方式：原生子 WebView / iframe / 自动（panel 失败回退 iframe）
   * 纯 Web 与移动端忽略此项。
   */
  innerWebRenderMode?: 'auto' | 'tauri-panel' | 'iframe';
}

/**
 * 默认应用设置
 */
const defaultAppSettings: AppSettings = {
  theme: 'auto',
  language: 'zh-CN',
  autoStart: false,
  minimizeToTray: true,
  closeToTray: true,
  restoreWindowState: true,
  reduceMotion: false,
  shellLayout: 'auto',
  booksDirectorySet: false,
  rememberImportAction: false,
  tocPaginationSafetyEnabled: true,
  tocPaginationMaxPages: 80,
  bookInfoPresentation: 'page',
  innerWebRenderMode: 'auto',
};

/**
 * 设置状态接口
 */
export interface SettingsState {
  /** 应用设置 */
  app: AppSettings;
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
}

/**
 * 创建设置状态
 */
const [state, setState] = createStore<SettingsState>({
  app: defaultAppSettings,
  loading: false,
  error: null,
});

/** 直接导出 store 根，供 createMemo 细粒度订阅（经 getter 访问可能不触发更新） */
export const settingsState = state;

/**
 * 设置存储键名
 */
const SETTINGS_STORAGE_KEY = 'app_settings';

/**
 * 设置Store Actions
 */
export const settingsStore = {
  /** 获取状态 */
  get state() {
    return state;
  },

  /**
   * 加载设置
   */
  async loadSettings(): Promise<void> {
    setState({ loading: true, error: null });

    try {
      const stored = await getStorage<AppSettings>(SETTINGS_STORAGE_KEY);
      if (stored) {
        const { migrateAppStorageSettings } = await import(
          '@/lib/platform/fs/migration'
        );
        const migrated = migrateAppStorageSettings({
          ...defaultAppSettings,
          ...stored,
        });
        setState({ app: migrated, loading: false });
        if (migrated.booksStorageRoot && migrated.booksStorageRoot !== stored.booksStorageRoot) {
          await setStorage(SETTINGS_STORAGE_KEY, migrated);
        }
      } else {
        setState({ loading: false });
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : '加载设置失败';
      setState({ error, loading: false });
      console.error(error, e);
    }
  },

  /**
   * 保存设置
   */
  async saveSettings(): Promise<void> {
    try {
      await setStorage(SETTINGS_STORAGE_KEY, state.app);
    } catch (e) {
      const error = e instanceof Error ? e.message : '保存设置失败';
      setState({ error });
      console.error(error, e);
      throw e;
    }
  },

  /**
   * 更新应用设置
   */
  async updateAppSettings(updates: Partial<AppSettings>): Promise<void> {
    setState('app', prev => ({ ...prev, ...updates }));
    await this.saveSettings();
  },

  /**
   * 设置主题
   */
  async setTheme(theme: 'light' | 'dark' | 'auto'): Promise<void> {
    await this.updateAppSettings({ theme });
  },

  /**
   * 设置语言
   */
  async setLanguage(language: string): Promise<void> {
    await this.updateAppSettings({ language });
  },

  /**
   * 设置自动启动
   */
  async setAutoStart(autoStart: boolean): Promise<void> {
    await this.updateAppSettings({ autoStart });
  },

  /**
   * 设置最小化到托盘
   */
  async setMinimizeToTray(minimizeToTray: boolean): Promise<void> {
    await this.updateAppSettings({ minimizeToTray });
  },

  /**
   * 设置关闭到托盘
   */
  async setCloseToTray(closeToTray: boolean): Promise<void> {
    await this.updateAppSettings({ closeToTray });
  },

  /**
   * 设置减少动效
   */
  async setReduceMotion(reduceMotion: boolean): Promise<void> {
    await this.updateAppSettings({ reduceMotion });
  },

  async setShellLayout(shellLayout: ShellLayoutPreference): Promise<void> {
    await this.updateAppSettings({ shellLayout });
  },

  /**
   * 设置书籍存储目录
   */
  async setBooksDirectory(directory: string): Promise<void> {
    await this.updateAppSettings({
      booksDirectory: directory,
      booksDirectorySet: true
    });
  },

  /**
   * 设置封面缓存目录；传空字符串表示恢复默认（数据根/cover-cache）
   */
  async setCoverCacheDirectory(directory: string): Promise<void> {
    const { clearCoverCacheDirectoryCache } = await import(
      '@/lib/cover/cover-cache-path'
    );
    const trimmed = directory.trim();
    if (!trimmed) {
      await this.updateAppSettings({
        coverCacheDirectory: undefined,
        coverCacheDirectorySet: false,
      });
    } else {
      await this.updateAppSettings({
        coverCacheDirectory: trimmed,
        coverCacheDirectorySet: true,
      });
    }
    clearCoverCacheDirectoryCache();
  },

  /**
   * 设置导入书籍操作偏好
   */
  async setImportBookAction(
    action: 'copy' | 'move' | 'none',
    remember: boolean = false,
  ): Promise<void> {
    await this.updateAppSettings({
      importBookAction: action,
      rememberImportAction: remember
    });
  },

  /**
   * 设置删除文件操作偏好
   */
  async setDeleteFileAction(deleteFile: boolean, remember: boolean = false): Promise<void> {
    await this.updateAppSettings({
      deleteFileAction: deleteFile,
      rememberDeleteFileAction: remember
    });
  },

  /**
   * 设置文件替换操作偏好
   */
  async setReplaceFileAction(action: 'replace' | 'skip' | 'restore-existing' | 'rename-import', remember: boolean = false): Promise<void> {
    await this.updateAppSettings({
      replaceExistingFile: action,
      rememberReplaceFile: remember
    });
  },

  async setImportSourceKeepOptions(options: {
    importKeepName?: boolean;
    importKeepGroup?: boolean;
    importKeepEnable?: boolean;
  }): Promise<void> {
    await this.updateAppSettings(options);
  },

  async setBookInfoPresentation(
    bookInfoPresentation: 'page' | 'drawer',
  ): Promise<void> {
    await this.updateAppSettings({ bookInfoPresentation });
  },

  async setInnerWebRenderMode(
    innerWebRenderMode: 'auto' | 'tauri-panel' | 'iframe',
  ): Promise<void> {
    resetInnerWebPanelRuntimeAvailability();
    onInnerWebSessionEnded();
    await this.updateAppSettings({ innerWebRenderMode });
  },

  async setTocPaginationSafety(enabled: boolean, maxPages?: number): Promise<void> {
    const normalizedMax =
      typeof maxPages === 'number' && Number.isFinite(maxPages)
        ? Math.max(1, Math.min(2000, Math.floor(maxPages)))
        : state.app.tocPaginationMaxPages;
    await this.updateAppSettings({
      tocPaginationSafetyEnabled: enabled,
      tocPaginationMaxPages: normalizedMax,
    });
  },

  /**
   * 重置设置为默认值
   */
  async resetSettings(): Promise<void> {
    setState({ app: defaultAppSettings });
    await this.saveSettings();
  },

  /**
   * 清除错误信息
   */
  clearError(): void {
    setState({ error: null });
  },
};

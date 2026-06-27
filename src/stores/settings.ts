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
import type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';
import { defaultViewerChromeLayout } from '@/components/viewer/viewer-chrome';
import {
  defaultMediaPlayerChromeLayout,
  defaultMediaPlayerChromePosition,
  type MediaPlayerChromePosition,
} from '@/lib/viewer/media-player-chrome-layout';
import { readHmrData, writeHmrData } from '@/lib/dev/hmr-state';
import {
  onInnerWebSessionEnded,
  resetInnerWebPanelRuntimeAvailability,
} from '@/lib/platform/inner-web-mode';
import { isTauri } from '@/lib/platform/detect';
import { migrateAppStorageSettings } from '@/lib/platform/fs/migration';
import { getStorage, setStorage } from '@/lib/platform/storage';
import {
  DEFAULT_APP_TOAST_POSITION,
  DEFAULT_APP_TOAST_STYLE,
  normalizeAppToastPosition,
  normalizeAppToastStyle,
  type AppToastPosition,
  type AppToastStyle,
} from '@/lib/ui/app-toast-config';
import { clampThemeHour, normalizeThemeMode, normalizeThemeScheduleHours } from '@/lib/theme';

/**
 * 应用设置接口
 */
export interface AppSettings {
  /** 主题：light | dark | auto（跟随系统）| schedule（按时） */
  theme: 'light' | 'dark' | 'auto' | 'schedule';
  /** 按时模式：浅色开始时刻（0–23） */
  themeScheduleDayHour?: number;
  /** 按时模式：深色开始时刻（0–23） */
  themeScheduleNightHour?: number;
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
  /** 是否显示界面工具提示（按钮悬停说明等） */
  showTooltips?: boolean;
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
  /** 书源页发现抽屉布局：default=按脚本 style；legado=强制三列 */
  sourceExploreDrawerLayout?: 'default' | 'legado';
  /** 阅读器顶栏与底栏布局：fixed 占位 | stacked 层叠 | floating 独立悬浮控件
   * 旧值 overlay 在加载时迁移为 stacked
   */
  viewerChromeLayout?: ViewerChromeLayout;
  /** 全局媒体播放器布局：fixed | stacked | floating */
  mediaPlayerChromeLayout?: ViewerChromeLayout;
  /** 全局媒体播放器位置：top | bottom */
  mediaPlayerChromePosition?: MediaPlayerChromePosition;
  /** 是否启用阅读时长记录（对齐 legado enableReadRecord） */
  enableReadRecord?: boolean;
  /** 通知 Toast 风格：default | sonner | toast */
  toastStyle?: AppToastStyle;
  /** 通知 Toast 位置 */
  toastPosition?: AppToastPosition;
}

/**
 * 默认应用设置
 */
const defaultAppSettings: AppSettings = {
  theme: 'auto',
  themeScheduleDayHour: 6,
  themeScheduleNightHour: 18,
  language: 'zh-CN',
  autoStart: false,
  minimizeToTray: true,
  closeToTray: true,
  restoreWindowState: true,
  reduceMotion: false,
  showTooltips: true,
  shellLayout: 'auto',
  booksDirectorySet: false,
  rememberImportAction: false,
  tocPaginationSafetyEnabled: true,
  tocPaginationMaxPages: 80,
  bookInfoPresentation: 'page',
  innerWebRenderMode: 'auto',
  sourceExploreDrawerLayout: 'default',
  viewerChromeLayout: defaultViewerChromeLayout,
  mediaPlayerChromeLayout: defaultMediaPlayerChromeLayout,
  mediaPlayerChromePosition: defaultMediaPlayerChromePosition,
  enableReadRecord: true,
  toastStyle: DEFAULT_APP_TOAST_STYLE,
  toastPosition: DEFAULT_APP_TOAST_POSITION,
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

/** 与 platform/storage WebStorage 前缀一致，用于首屏同步水合 */
const WEB_SETTINGS_STORAGE_ITEM_KEY = `store_settings.json_${SETTINGS_STORAGE_KEY}`;

const HMR_SETTINGS_KEY = 'appSettingsSnapshot';

let settingsHydrated = false;
let loadSettingsPromise: Promise<void> | null = null;

function mergeStoredAppSettings(stored: Partial<AppSettings>): AppSettings {
  const merged = migrateAppStorageSettings({
    ...defaultAppSettings,
    ...stored,
  });
  return {
    ...merged,
    theme: normalizeThemeMode(merged.theme),
    themeScheduleDayHour: clampThemeHour(
      merged.themeScheduleDayHour,
      defaultAppSettings.themeScheduleDayHour!,
    ),
    themeScheduleNightHour: clampThemeHour(
      merged.themeScheduleNightHour,
      defaultAppSettings.themeScheduleNightHour!,
    ),
    toastStyle: normalizeAppToastStyle(merged.toastStyle),
    toastPosition: normalizeAppToastPosition(merged.toastPosition),
  };
}

/** Web：在首屏渲染前从 localStorage 同步恢复，避免闪回默认布局 */
function hydrateSettingsFromWebStorageSync(): void {
  if (isTauri() || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(WEB_SETTINGS_STORAGE_ITEM_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Partial<AppSettings>;
    setState('app', mergeStoredAppSettings(stored));
  } catch (e) {
    console.warn('[settings] Web 同步水合失败，将等待异步加载', e);
  }
}

/** DEV HMR：模块热替换时恢复内存中的设置，避免壳层布局等偏好被重置 */
function restoreSettingsFromHmr(): void {
  if (!import.meta.env.DEV || !import.meta.hot) return;
  const cached = readHmrData<Partial<AppSettings> | null>(HMR_SETTINGS_KEY, null);
  if (!cached) return;
  setState('app', mergeStoredAppSettings(cached));
}

function snapshotSettingsForHmr(): void {
  if (!import.meta.env.DEV || !import.meta.hot) return;
  writeHmrData(HMR_SETTINGS_KEY, { ...state.app });
}

restoreSettingsFromHmr();
hydrateSettingsFromWebStorageSync();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    snapshotSettingsForHmr();
  });
}

/**
 * 设置Store Actions
 */
export const settingsStore = {
  /** 获取状态 */
  get state() {
    return state;
  },

  /** 是否已完成至少一次持久化加载 */
  isHydrated(): boolean {
    return settingsHydrated;
  },

  /**
   * 加载设置
   */
  async loadSettings(): Promise<void> {
    if (loadSettingsPromise) {
      return loadSettingsPromise;
    }

    loadSettingsPromise = (async () => {
      setState({ loading: true, error: null });

      try {
        const stored = await getStorage<AppSettings>(SETTINGS_STORAGE_KEY);
        if (stored) {
          const migrated = mergeStoredAppSettings(stored);
          setState({ app: migrated, loading: false });
          if (migrated.booksStorageRoot && migrated.booksStorageRoot !== stored.booksStorageRoot) {
            await setStorage(SETTINGS_STORAGE_KEY, migrated);
          }
        } else {
          setState({ loading: false });
        }
        settingsHydrated = true;
        snapshotSettingsForHmr();
      } catch (e) {
        const error = e instanceof Error ? e.message : '加载设置失败';
        setState({ error, loading: false });
        console.error(error, e);
      } finally {
        loadSettingsPromise = null;
      }
    })();

    return loadSettingsPromise;
  },

  /**
   * 保存设置
   */
  async saveSettings(): Promise<void> {
    if (!settingsHydrated) {
      await this.loadSettings();
    }

    try {
      await setStorage(SETTINGS_STORAGE_KEY, state.app);
      snapshotSettingsForHmr();
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
  async setTheme(theme: 'light' | 'dark' | 'auto' | 'schedule'): Promise<void> {
    await this.updateAppSettings({ theme });
  },

  async setThemeScheduleHours(hours: {
    dayStartHour: number;
    nightStartHour: number;
  }): Promise<void> {
    const normalized = normalizeThemeScheduleHours(hours);
    await this.updateAppSettings({
      themeScheduleDayHour: normalized.dayStartHour,
      themeScheduleNightHour: normalized.nightStartHour,
    });
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

  async setShowTooltips(showTooltips: boolean): Promise<void> {
    await this.updateAppSettings({ showTooltips });
  },

  async setToastStyle(toastStyle: AppToastStyle): Promise<void> {
    await this.updateAppSettings({ toastStyle: normalizeAppToastStyle(toastStyle) });
  },

  async setToastPosition(toastPosition: AppToastPosition): Promise<void> {
    await this.updateAppSettings({
      toastPosition: normalizeAppToastPosition(toastPosition),
    });
  },

  async setShellLayout(shellLayout: ShellLayoutPreference): Promise<void> {
    await this.updateAppSettings({ shellLayout });
  },

  async setViewerChromeLayout(viewerChromeLayout: ViewerChromeLayout): Promise<void> {
    await this.updateAppSettings({ viewerChromeLayout });
  },

  async setMediaPlayerChromeLayout(mediaPlayerChromeLayout: ViewerChromeLayout): Promise<void> {
    await this.updateAppSettings({ mediaPlayerChromeLayout });
  },

  async setMediaPlayerChromePosition(
    mediaPlayerChromePosition: MediaPlayerChromePosition,
  ): Promise<void> {
    await this.updateAppSettings({ mediaPlayerChromePosition });
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

  async setEnableReadRecord(enableReadRecord: boolean): Promise<void> {
    await this.updateAppSettings({ enableReadRecord });
  },

  async setSourceExploreDrawerLayout(
    sourceExploreDrawerLayout: 'default' | 'legado',
  ): Promise<void> {
    await this.updateAppSettings({ sourceExploreDrawerLayout });
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

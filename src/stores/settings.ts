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
import type {
  ShellLayoutPreference,
  MobileShellNavStyle,
  DesktopSidebarMode,
} from '@/lib/shell/layout';
import type { ViewerChromeLayout } from '@/components/media/viewer/viewer-chrome';
import { defaultViewerChromeLayout } from '@/components/media/viewer/viewer-chrome';
import {
  defaultMediaPlayerChromeLayout,
  defaultMediaPlayerChromePosition,
  type MediaPlayerChromePosition,
} from '@/lib/viewer/media-player-chrome-layout';
import {
  normalizeMediaPlayerFloat,
  type MediaPlayerFloatState,
} from '@/lib/viewer/global-media-player-float-pos';
import { readHmrData, writeHmrData } from '@/lib/dev/hmr-state';
import {
  onInnerWebSessionEnded,
  resetInnerWebPanelRuntimeAvailability,
} from '@/lib/platform/inner-web-mode';
import { isTauri } from '@/lib/platform/detect';
import { migrateAppStorageSettings } from '@/lib/platform/fs/migration';
import { getStorage, setStorage } from '@/lib/platform/storage';
import {
  DEFAULT_APP_TOAST_EXPAND,
  DEFAULT_APP_TOAST_POSITION,
  DEFAULT_APP_TOAST_VISIBLE_LIMIT,
  normalizeAppToastExpand,
  normalizeAppToastPosition,
  normalizeAppToastVisibleLimit,
  type AppToastPosition,
} from '@/lib/ui/app-toast-config';
import {
  DEFAULT_VIEWER_CHROME_OVERLAY_BLUR_PX,
  DEFAULT_VIEWER_CHROME_OVERLAY_OPACITY,
  normalizeViewerChromeOverlayBlurPx,
  normalizeViewerChromeOverlayOpacity,
} from '@/lib/viewer/media-viewer-chrome-overlay-appearance';
import {
  clampThemeHour,
  normalizeThemeMode,
  normalizeThemeScheduleHours,
  syncThemeBootstrapSnapshotFromAppSettings,
} from '@/lib/theme';
import {
  DEFAULT_AUTO_CHECK_UPDATES,
  DEFAULT_APP_FONT_FAMILY,
  DEFAULT_APP_FONT_PATH,
  DEFAULT_APP_FONT_SIZE,
  DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
  DEFAULT_NETWORK_RETRY_COUNT,
  DEFAULT_OUTBOUND_PROXY_MODE,
  DEFAULT_OUTBOUND_PROXY_URL,
  DEFAULT_STARTUP_PAGE,
  normalizeMainProgramSettings,
  applyMainProgramAppearance,
  setRuntimeNetworkDefaults,
  syncShellOutboundProxyToRust,
  type OutboundProxyMode,
  type StartupPage,
} from '@/lib/settings/main-program-settings';
import {
  DEFAULT_MEDIA_FOCUS_DUCK_GAIN,
  DEFAULT_MEDIA_FOCUS_MODE,
  normalizeMediaFocusDuckGain,
  normalizeMediaFocusMode,
  normalizeMediaFocusPolicyOverrides,
  syncMediaFocusConfigFromSettings,
  type MediaFocusMode,
  type MediaFocusPolicyOverrides,
} from '@/lib/media/media-focus-config';
import {
  normalizeActiveThemePresetByTarget,
  type ActiveThemePresetByTarget,
  type ThemeTargetId,
} from '@/lib/theme/theme-targets';

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
  /** 主程序启动后打开的页面 */
  startupPage?: StartupPage;
  /** 主程序网络请求的默认超时（秒） */
  networkRequestTimeoutSeconds?: number;
  /** 主程序网络请求失败后的默认重试次数 */
  networkRetryCount?: number;
  /** 壳级出站代理模式：none | env | windows | custom */
  outboundProxyMode?: OutboundProxyMode;
  /** 自定义出站代理 URL（仅 custom） */
  outboundProxyUrl?: string;
  /** 启动后自动检查应用更新 */
  autoCheckUpdates?: boolean;
  /** 应用界面基础字号（px） */
  appFontSize?: number;
  /** 应用界面字体族；空字符串表示系统默认 */
  appFontFamily?: string;
  /** 本地字体文件路径；有值时优先注册 @font-face */
  appFontPath?: string;
  /**
   * 跨模块媒体焦点模式：
   * - pauseAll：起播时暂停其它全部
   * - smart：按策略表 PAUSE / DUCK / NONE（默认）
   */
  mediaFocusMode?: MediaFocusMode;
  /** smart 模式下 DUCK 目标增益（0.05–0.5） */
  mediaFocusDuckGain?: number;
  /** 可选：覆盖默认策略表 */
  mediaFocusPolicyOverrides?: MediaFocusPolicyOverrides;
  /** 减少动效（无障碍 / 偏好） */
  reduceMotion: boolean;
  /** 是否显示界面工具提示（按钮悬停说明等） */
  showTooltips?: boolean;
  /**
   * 宽屏（≥480px）下的壳层布局：桌面、移动，或自动（按运行环境）。
   * 仅移动端且宽度不足 480px 时强制使用底栏。
   */
  shellLayout?: ShellLayoutPreference;
  /** 移动壳层子页导航：顶栏下拉 vs 侧栏 Sheet */
  mobileShellNavStyle?: MobileShellNavStyle;
  /** 桌面壳层：融合侧栏 vs 独立模块侧栏 */
  desktopSidebarMode?: DesktopSidebarMode;
  /** 书籍存储目录（首次导入时设置，path: 兼容字段） */
  booksDirectory?: string;
  /** 书籍库根 StorageRef 字符串（path: / saf-tree: / opfs: / handle:dir:） */
  booksStorageRoot?: string;
  /** 是否已设置书籍目录 */
  booksDirectorySet?: boolean;
  /** 书籍库：是否跟随阅读模块 MediaRoot（Reader/Local） */
  booksUseGlobalMediaRoot?: boolean;
  /** 书籍库：自定义目录（不跟随时） */
  booksMediaRootDirectory?: string;
  /** 封面缓存目录（可选；未设置则用数据根目录下的 cover-cache） */
  coverCacheDirectory?: string;
  /** 是否已自定义封面缓存目录 */
  coverCacheDirectorySet?: boolean;
  /** 全局媒体根目录（未设置时默认 dataDir/Media） */
  mediaRootDirectory?: string;
  /** 阅读模块：是否跟随全局媒体根目录 */
  readingUseGlobalMediaRoot?: boolean;
  /** 阅读模块：自定义媒体根目录 */
  readingMediaRootDirectory?: string;
  /** 音乐模块：是否跟随全局媒体根目录 */
  musicUseGlobalMediaRoot?: boolean;
  /** 音乐模块：自定义媒体根目录 */
  musicMediaRootDirectory?: string;
  /** 影视模块：是否跟随全局媒体根目录 */
  videoUseGlobalMediaRoot?: boolean;
  /** 影视模块：自定义媒体根目录 */
  videoMediaRootDirectory?: string;
  /** 下载模块：是否跟随全局媒体根目录 */
  downloadUseGlobalMediaRoot?: boolean;
  /** 下载模块：自定义媒体根目录 */
  downloadMediaRootDirectory?: string;
  /** 本地音频库：是否跟随音乐模块 MediaRoot（Audio/Local） */
  audioLocalUseGlobalMediaRoot?: boolean;
  /** 本地音频库：自定义目录（不跟随时，path） */
  audioLocalMediaRootDirectory?: string;
  /** 本地音频库根 StorageRef（path: / saf-tree: / opfs: / handle:dir:） */
  audioLocalStorageRoot?: string;
  /** 本地视频库：是否跟随影视模块 MediaRoot（Video/Local） */
  videoLocalUseGlobalMediaRoot?: boolean;
  /** 本地视频库：自定义目录（不跟随时，path） */
  videoLocalMediaRootDirectory?: string;
  /** 本地视频库根 StorageRef */
  videoLocalStorageRoot?: string;
  /** 导出时记住上次目录 */
  rememberLastExportDirectory?: boolean;
  /** 导出时直接保存到模块 Download 子目录（不弹窗） */
  silentExportToModuleDirectory?: boolean;
  /** 最近一次导出目录 */
  lastExportDirectory?: string;
  /** 导入书籍时的操作偏好：copy / move / none（不写入书籍库，保留原位置） */
  importBookAction?: 'copy' | 'move' | 'none';
  /** 是否记住导入操作偏好 */
  rememberImportAction?: boolean;
  /** 导入本地音频时的操作偏好 */
  importAudioAction?: 'copy' | 'move' | 'none';
  /** 是否记住本地音频导入操作偏好 */
  rememberImportAudioAction?: boolean;
  /** 导入本地视频时的操作偏好 */
  importVideoAction?: 'copy' | 'move' | 'none';
  /** 是否记住本地视频导入操作偏好 */
  rememberImportVideoAction?: boolean;
  /** 删除书籍时是否删除本地文件 */
  deleteFileAction?: boolean;
  /** 是否记住删除文件操作偏好 */
  rememberDeleteFileAction?: boolean;
  /** 移除下载任务时是否同时删除本地下载文件 */
  deleteDownloadFileAction?: boolean;
  /** 是否记住移除下载任务时的删文件偏好 */
  rememberDeleteDownloadFileAction?: boolean;
  /** 下载模块：删除任务时是否同时删除本地文件 */
  deleteDownloadHubFileAction?: boolean;
  /** 下载模块：是否记住删除任务时的删文件偏好 */
  rememberDeleteDownloadHubFileAction?: boolean;
  /**
   * 下载模块：删除无本地文件的任务（文件丢失 / 未落盘等）时跳过确认弹窗
   */
  skipConfirmDeleteDownloadHubNoFile?: boolean;
  /** 下载模块：删除进行中/已暂停任务时是否同时删除本地临时文件 */
  deleteDownloadHubInProgressFileAction?: boolean;
  /** 下载模块：是否记住删除进行中/已暂停任务时的删文件偏好 */
  rememberDeleteDownloadHubInProgressFileAction?: boolean;
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
  /** 主题库本地目录（可选，用于扫描导入） */
  themesLibraryPath?: string;
  /** 导入主题时保留本地显示名 */
  importKeepThemeName?: boolean;
  /** 导入主题时保留当前激活预设不被覆盖 */
  importKeepThemeActive?: boolean;
  /** 导入主题 ZIP 时覆盖本地资产（false 则保留已有资产清单） */
  importOverwriteThemeAssets?: boolean;
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
  /**
   * media-viewer 层叠/悬浮顶底栏及附加区域背景不透明度（0–100，默认 100 不透明）
   */
  viewerChromeOverlayOpacity?: number;
  /** media-viewer 层叠/悬浮顶底栏及附加区域背景模糊（px，默认 0 不模糊） */
  viewerChromeOverlayBlurPx?: number;
  /** 全局阴影特效（悬浮胶囊光晕、Toast 等）；关闭可提升低端设备性能 */
  enableVisualShadow?: boolean;
  /** 全局半透明背景；关闭时 chrome / 主题 surface 强制不透明 */
  enableVisualTransparency?: boolean;
  /** 全局背景模糊（backdrop-filter）；关闭可显著降低 GPU 开销 */
  enableVisualBlur?: boolean;
  /** 当前激活的应用壳层主题预设 ID */
  activeThemePresetId?: string;
  /** 当前激活的阅读器主题预设 ID */
  activeViewerThemePresetId?: string;
  /** v3：按应用壳层、模块、阅读器或音乐页面记录活动主题 */
  activeThemePresetByTarget?: ActiveThemePresetByTarget;
  /** 全局媒体播放器布局：fixed | stacked | floating */
  mediaPlayerChromeLayout?: ViewerChromeLayout;
  /** 全局媒体播放器位置：top | bottom */
  mediaPlayerChromePosition?: MediaPlayerChromePosition;
  /**
   * 切章/切歌时是否自动展开已收起的全局播放器（层叠/悬浮可收起时）
   * 默认 true，与历史「切歌即展开」行为一致
   */
  mediaPlayerAutoExpandOnTrackChange?: boolean;
  /**
   * 因切章/切歌自动展开后，等待多少秒再自动收起；0 表示不自动收起
   */
  mediaPlayerAutoCollapseAfterExpandSec?: number;
  /** 悬浮全局播放窗位置与贴边（viewport 坐标） */
  mediaPlayerFloat?: MediaPlayerFloatState;
  /** 是否启用阅读时长记录（对齐 legado enableReadRecord） */
  enableReadRecord?: boolean;
  /** 通知 Toast 位置 */
  toastPosition?: AppToastPosition;
  /** 通知 Toast 同屏最大条数 */
  toastVisibleLimit?: number;
  /** 通知 Toast 堆叠缩放（solid-sonner `expand`） */
  toastExpand?: boolean;
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
  startupPage: DEFAULT_STARTUP_PAGE,
  networkRequestTimeoutSeconds: DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
  networkRetryCount: DEFAULT_NETWORK_RETRY_COUNT,
  outboundProxyMode: DEFAULT_OUTBOUND_PROXY_MODE,
  outboundProxyUrl: DEFAULT_OUTBOUND_PROXY_URL,
  autoCheckUpdates: DEFAULT_AUTO_CHECK_UPDATES,
  appFontSize: DEFAULT_APP_FONT_SIZE,
  appFontFamily: DEFAULT_APP_FONT_FAMILY,
  appFontPath: DEFAULT_APP_FONT_PATH,
  mediaFocusMode: DEFAULT_MEDIA_FOCUS_MODE,
  mediaFocusDuckGain: DEFAULT_MEDIA_FOCUS_DUCK_GAIN,
  mediaFocusPolicyOverrides: {},
  reduceMotion: false,
  showTooltips: true,
  shellLayout: 'auto',
  mobileShellNavStyle: 'topBar',
  desktopSidebarMode: 'fused',
  booksDirectorySet: false,
  booksUseGlobalMediaRoot: true,
  readingUseGlobalMediaRoot: true,
  musicUseGlobalMediaRoot: true,
  videoUseGlobalMediaRoot: true,
  downloadUseGlobalMediaRoot: true,
  audioLocalUseGlobalMediaRoot: true,
  videoLocalUseGlobalMediaRoot: true,
  rememberLastExportDirectory: false,
  silentExportToModuleDirectory: false,
  rememberImportAction: false,
  rememberImportAudioAction: false,
  rememberImportVideoAction: false,
  tocPaginationSafetyEnabled: true,
  tocPaginationMaxPages: 80,
  bookInfoPresentation: 'page',
  innerWebRenderMode: 'auto',
  sourceExploreDrawerLayout: 'default',
  viewerChromeLayout: defaultViewerChromeLayout,
  viewerChromeOverlayOpacity: DEFAULT_VIEWER_CHROME_OVERLAY_OPACITY,
  viewerChromeOverlayBlurPx: DEFAULT_VIEWER_CHROME_OVERLAY_BLUR_PX,
  enableVisualShadow: true,
  enableVisualTransparency: true,
  enableVisualBlur: true,
  mediaPlayerChromeLayout: defaultMediaPlayerChromeLayout,
  mediaPlayerChromePosition: defaultMediaPlayerChromePosition,
  mediaPlayerAutoExpandOnTrackChange: true,
  mediaPlayerAutoCollapseAfterExpandSec: 0,
  enableReadRecord: true,
  toastPosition: DEFAULT_APP_TOAST_POSITION,
  toastVisibleLimit: DEFAULT_APP_TOAST_VISIBLE_LIMIT,
  toastExpand: DEFAULT_APP_TOAST_EXPAND,
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
/** 串行化写入，防止并发 save 用旧快照覆盖新布局等字段 */
let settingsSaveChain: Promise<void> = Promise.resolve();

function mergeStoredAppSettings(stored: Partial<AppSettings>): AppSettings {
  const merged = migrateAppStorageSettings({
    ...defaultAppSettings,
    ...stored,
  });
  const mainProgramSettings = normalizeMainProgramSettings(merged);
  setRuntimeNetworkDefaults({
    timeoutSeconds: mainProgramSettings.networkRequestTimeoutSeconds,
    retryCount: mainProgramSettings.networkRetryCount,
    outboundProxyMode: mainProgramSettings.outboundProxyMode,
    outboundProxyUrl: mainProgramSettings.outboundProxyUrl,
  });
  void syncShellOutboundProxyToRust({
    mode: mainProgramSettings.outboundProxyMode,
    url: mainProgramSettings.outboundProxyUrl,
  });
  applyMainProgramAppearance({
    appFontSize: mainProgramSettings.appFontSize,
    appFontFamily: mainProgramSettings.appFontFamily,
    appFontPath: mainProgramSettings.appFontPath,
  });
  const mediaFocusMode = normalizeMediaFocusMode(merged.mediaFocusMode);
  const mediaFocusDuckGain = normalizeMediaFocusDuckGain(merged.mediaFocusDuckGain);
  const mediaFocusPolicyOverrides = normalizeMediaFocusPolicyOverrides(
    merged.mediaFocusPolicyOverrides,
  );
  syncMediaFocusConfigFromSettings({
    mediaFocusMode,
    mediaFocusDuckGain,
    mediaFocusPolicyOverrides,
  });
  const activeThemePresetByTarget = normalizeActiveThemePresetByTarget(
    merged.activeThemePresetByTarget,
    merged,
  );
  const result = {
    ...merged,
    ...mainProgramSettings,
    mediaFocusMode,
    mediaFocusDuckGain,
    mediaFocusPolicyOverrides,
    theme: normalizeThemeMode(merged.theme),
    themeScheduleDayHour: clampThemeHour(
      merged.themeScheduleDayHour,
      defaultAppSettings.themeScheduleDayHour!,
    ),
    themeScheduleNightHour: clampThemeHour(
      merged.themeScheduleNightHour,
      defaultAppSettings.themeScheduleNightHour!,
    ),
    toastPosition: normalizeAppToastPosition(merged.toastPosition),
    toastVisibleLimit: normalizeAppToastVisibleLimit(merged.toastVisibleLimit),
    toastExpand: normalizeAppToastExpand(merged.toastExpand),
    viewerChromeOverlayOpacity: normalizeViewerChromeOverlayOpacity(
      merged.viewerChromeOverlayOpacity,
    ),
    viewerChromeOverlayBlurPx: normalizeViewerChromeOverlayBlurPx(
      merged.viewerChromeOverlayBlurPx,
    ),
    mediaPlayerFloat: normalizeMediaPlayerFloat(merged.mediaPlayerFloat),
    activeThemePresetByTarget,
    activeThemePresetId: activeThemePresetByTarget.app,
    activeViewerThemePresetId: activeThemePresetByTarget['module.reading'],
  };
  syncThemeBootstrapSnapshotFromAppSettings(result);
  return result;
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
          if (
            (migrated.booksStorageRoot && migrated.booksStorageRoot !== stored.booksStorageRoot) ||
            (!stored.activeThemePresetByTarget &&
              Object.keys(migrated.activeThemePresetByTarget ?? {}).length > 0)
          ) {
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
   * 保存设置（串行化，避免 mediaPlayerFloat 等高频写入与布局切换互相覆盖）
   */
  async saveSettings(): Promise<void> {
    // 未水合时先加载，但由 updateAppSettings 保证「先水合再合并更新」，此处不再二次 load 覆盖内存
    if (!settingsHydrated) {
      await this.loadSettings();
    }

    const run = async () => {
      try {
        await setStorage(SETTINGS_STORAGE_KEY, { ...state.app });
        snapshotSettingsForHmr();
      } catch (e) {
        const error = e instanceof Error ? e.message : '保存设置失败';
        setState({ error });
        console.error(error, e);
        throw e;
      }
    };

    settingsSaveChain = settingsSaveChain.then(run, run);
    await settingsSaveChain;
  },

  /**
   * 更新应用设置
   */
  async updateAppSettings(updates: Partial<AppSettings>): Promise<void> {
    // 必须先水合再合并，否则 saveSettings→loadSettings 会冲掉本次 updates
    if (!settingsHydrated) {
      await this.loadSettings();
    }
    setState('app', (prev) => ({ ...prev, ...updates }));
    if (
      updates.mediaFocusMode !== undefined ||
      updates.mediaFocusDuckGain !== undefined ||
      updates.mediaFocusPolicyOverrides !== undefined
    ) {
      const app = state.app;
      syncMediaFocusConfigFromSettings({
        mediaFocusMode: app.mediaFocusMode,
        mediaFocusDuckGain: app.mediaFocusDuckGain,
        mediaFocusPolicyOverrides: app.mediaFocusPolicyOverrides,
      });
    }
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
    if (isTauri()) {
      const { enable, disable } = await import('@tauri-apps/plugin-autostart');
      if (autoStart) await enable();
      else await disable();
    }
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

  async setRestoreWindowState(restoreWindowState: boolean): Promise<void> {
    await this.updateAppSettings({ restoreWindowState });
  },

  async setStartupPage(startupPage: StartupPage): Promise<void> {
    await this.updateAppSettings({ startupPage });
  },

  async setMediaFocusMode(mediaFocusMode: MediaFocusMode): Promise<void> {
    await this.updateAppSettings({
      mediaFocusMode: normalizeMediaFocusMode(mediaFocusMode),
    });
  },

  async setMediaFocusDuckGain(mediaFocusDuckGain: number): Promise<void> {
    await this.updateAppSettings({
      mediaFocusDuckGain: normalizeMediaFocusDuckGain(mediaFocusDuckGain),
    });
  },

  async setMediaFocusPolicyOverrides(
    mediaFocusPolicyOverrides: MediaFocusPolicyOverrides,
  ): Promise<void> {
    await this.updateAppSettings({
      mediaFocusPolicyOverrides: normalizeMediaFocusPolicyOverrides(
        mediaFocusPolicyOverrides,
      ),
    });
  },

  async setNetworkRequestTimeoutSeconds(networkRequestTimeoutSeconds: number): Promise<void> {
    const normalized = normalizeMainProgramSettings({ networkRequestTimeoutSeconds });
    await this.updateAppSettings({
      networkRequestTimeoutSeconds: normalized.networkRequestTimeoutSeconds,
    });
    setRuntimeNetworkDefaults({
      timeoutSeconds: normalized.networkRequestTimeoutSeconds,
      retryCount: state.app.networkRetryCount ?? DEFAULT_NETWORK_RETRY_COUNT,
      outboundProxyMode: state.app.outboundProxyMode ?? DEFAULT_OUTBOUND_PROXY_MODE,
      outboundProxyUrl: state.app.outboundProxyUrl ?? DEFAULT_OUTBOUND_PROXY_URL,
    });
  },

  async setNetworkRetryCount(networkRetryCount: number): Promise<void> {
    const normalized = normalizeMainProgramSettings({ networkRetryCount });
    await this.updateAppSettings({ networkRetryCount: normalized.networkRetryCount });
    setRuntimeNetworkDefaults({
      timeoutSeconds:
        state.app.networkRequestTimeoutSeconds ?? DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
      retryCount: normalized.networkRetryCount,
      outboundProxyMode: state.app.outboundProxyMode ?? DEFAULT_OUTBOUND_PROXY_MODE,
      outboundProxyUrl: state.app.outboundProxyUrl ?? DEFAULT_OUTBOUND_PROXY_URL,
    });
  },

  async setOutboundProxyMode(outboundProxyMode: OutboundProxyMode): Promise<void> {
    const normalized = normalizeMainProgramSettings({
      outboundProxyMode,
      outboundProxyUrl: state.app.outboundProxyUrl,
    });
    await this.updateAppSettings({
      outboundProxyMode: normalized.outboundProxyMode,
      outboundProxyUrl: normalized.outboundProxyUrl,
    });
    setRuntimeNetworkDefaults({
      timeoutSeconds:
        state.app.networkRequestTimeoutSeconds ?? DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
      retryCount: state.app.networkRetryCount ?? DEFAULT_NETWORK_RETRY_COUNT,
      outboundProxyMode: normalized.outboundProxyMode,
      outboundProxyUrl: normalized.outboundProxyUrl,
    });
    void syncShellOutboundProxyToRust({
      mode: normalized.outboundProxyMode,
      url: normalized.outboundProxyUrl,
    });
  },

  async setOutboundProxyUrl(outboundProxyUrl: string): Promise<void> {
    const normalized = normalizeMainProgramSettings({
      outboundProxyMode: state.app.outboundProxyMode,
      outboundProxyUrl,
    });
    await this.updateAppSettings({
      outboundProxyMode: normalized.outboundProxyMode,
      outboundProxyUrl: normalized.outboundProxyUrl,
    });
    setRuntimeNetworkDefaults({
      timeoutSeconds:
        state.app.networkRequestTimeoutSeconds ?? DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
      retryCount: state.app.networkRetryCount ?? DEFAULT_NETWORK_RETRY_COUNT,
      outboundProxyMode: normalized.outboundProxyMode,
      outboundProxyUrl: normalized.outboundProxyUrl,
    });
    void syncShellOutboundProxyToRust({
      mode: normalized.outboundProxyMode,
      url: normalized.outboundProxyUrl,
    });
  },

  async setAutoCheckUpdates(autoCheckUpdates: boolean): Promise<void> {
    await this.updateAppSettings({ autoCheckUpdates });
  },

  async setAppFontSize(appFontSize: number): Promise<void> {
    const normalized = normalizeMainProgramSettings({ appFontSize });
    await this.updateAppSettings({ appFontSize: normalized.appFontSize });
    applyMainProgramAppearance({
      appFontSize: normalized.appFontSize,
      appFontFamily: state.app.appFontFamily ?? DEFAULT_APP_FONT_FAMILY,
      appFontPath: state.app.appFontPath ?? DEFAULT_APP_FONT_PATH,
    });
  },

  async setAppFontFamily(appFontFamily: string, appFontPath = ''): Promise<void> {
    const normalized = normalizeMainProgramSettings({ appFontFamily, appFontPath });
    await this.updateAppSettings({
      appFontFamily: normalized.appFontFamily,
      appFontPath: normalized.appFontPath,
    });
    applyMainProgramAppearance({
      appFontSize: state.app.appFontSize ?? DEFAULT_APP_FONT_SIZE,
      appFontFamily: normalized.appFontFamily,
      appFontPath: normalized.appFontPath,
    });
  },

  /**
   * 设置减少动效
   */
  async setReduceMotion(reduceMotion: boolean): Promise<void> {
    await this.updateAppSettings({ reduceMotion });
  },

  async setEnableVisualShadow(enableVisualShadow: boolean): Promise<void> {
    await this.updateAppSettings({ enableVisualShadow: !!enableVisualShadow });
  },

  async setEnableVisualTransparency(enableVisualTransparency: boolean): Promise<void> {
    await this.updateAppSettings({ enableVisualTransparency: !!enableVisualTransparency });
  },

  async setEnableVisualBlur(enableVisualBlur: boolean): Promise<void> {
    await this.updateAppSettings({ enableVisualBlur: !!enableVisualBlur });
  },

  setActiveThemePresetId(activeThemePresetId: string | undefined): void {
    void this.setActiveThemePresetForTarget('app', activeThemePresetId);
  },

  async setActiveViewerThemePresetId(activeViewerThemePresetId: string | undefined): Promise<void> {
    await this.setActiveThemePresetForTarget('module.reading', activeViewerThemePresetId);
  },

  async setActiveThemePresetForTarget(
    target: ThemeTargetId,
    presetId: string | undefined,
  ): Promise<void> {
    const next = {
      ...normalizeActiveThemePresetByTarget(state.app.activeThemePresetByTarget, state.app),
    };
    const normalizedId = presetId?.trim();
    if (normalizedId) next[target] = normalizedId;
    else delete next[target];

    const legacyUpdates =
      target === 'app'
        ? { activeThemePresetId: normalizedId }
        : target === 'module.reading'
          ? { activeViewerThemePresetId: normalizedId }
          : {};
    await this.updateAppSettings({
      activeThemePresetByTarget: next,
      ...legacyUpdates,
    });
    const { publishActiveThemeTargetChange } = await import('@/stores/theme-active-pack');
    publishActiveThemeTargetChange();
  },

  async clearActiveThemePresetForTarget(target: ThemeTargetId): Promise<void> {
    await this.setActiveThemePresetForTarget(target, undefined);
  },

  async setShowTooltips(showTooltips: boolean): Promise<void> {
    await this.updateAppSettings({ showTooltips });
  },

  async setToastPosition(toastPosition: AppToastPosition): Promise<void> {
    await this.updateAppSettings({
      toastPosition: normalizeAppToastPosition(toastPosition),
    });
  },

  async setToastVisibleLimit(toastVisibleLimit: number): Promise<void> {
    await this.updateAppSettings({
      toastVisibleLimit: normalizeAppToastVisibleLimit(toastVisibleLimit),
    });
  },

  async setToastExpand(toastExpand: boolean): Promise<void> {
    await this.updateAppSettings({
      toastExpand: normalizeAppToastExpand(toastExpand),
    });
  },

  async setShellLayout(shellLayout: ShellLayoutPreference): Promise<void> {
    await this.updateAppSettings({ shellLayout });
  },

  async setMobileShellNavStyle(mobileShellNavStyle: MobileShellNavStyle): Promise<void> {
    await this.updateAppSettings({ mobileShellNavStyle });
  },

  async setDesktopSidebarMode(desktopSidebarMode: DesktopSidebarMode): Promise<void> {
    await this.updateAppSettings({ desktopSidebarMode });
  },

  async setViewerChromeLayout(viewerChromeLayout: ViewerChromeLayout): Promise<void> {
    await this.updateAppSettings({ viewerChromeLayout });
  },

  async setViewerChromeOverlayOpacity(viewerChromeOverlayOpacity: number): Promise<void> {
    await this.updateAppSettings({
      viewerChromeOverlayOpacity: normalizeViewerChromeOverlayOpacity(viewerChromeOverlayOpacity),
    });
  },

  async setViewerChromeOverlayBlurPx(viewerChromeOverlayBlurPx: number): Promise<void> {
    await this.updateAppSettings({
      viewerChromeOverlayBlurPx: normalizeViewerChromeOverlayBlurPx(viewerChromeOverlayBlurPx),
    });
  },

  async setMediaPlayerChromeLayout(mediaPlayerChromeLayout: ViewerChromeLayout): Promise<void> {
    await this.updateAppSettings({ mediaPlayerChromeLayout });
  },

  async setMediaPlayerChromePosition(
    mediaPlayerChromePosition: MediaPlayerChromePosition,
  ): Promise<void> {
    await this.updateAppSettings({ mediaPlayerChromePosition });
  },

  async setMediaPlayerAutoExpandOnTrackChange(
    mediaPlayerAutoExpandOnTrackChange: boolean,
  ): Promise<void> {
    await this.updateAppSettings({ mediaPlayerAutoExpandOnTrackChange });
  },

  async setMediaPlayerAutoCollapseAfterExpandSec(
    mediaPlayerAutoCollapseAfterExpandSec: number,
  ): Promise<void> {
    const sec = Math.max(
      0,
      Math.min(300, Math.round(Number(mediaPlayerAutoCollapseAfterExpandSec) || 0)),
    );
    await this.updateAppSettings({ mediaPlayerAutoCollapseAfterExpandSec: sec });
  },

  async setMediaPlayerFloat(mediaPlayerFloat: MediaPlayerFloatState): Promise<void> {
    const normalized = normalizeMediaPlayerFloat(mediaPlayerFloat);
    if (!normalized) return;
    await this.updateAppSettings({ mediaPlayerFloat: normalized });
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

  /** 移除下载任务时是否同时删除本地下载文件 */
  async setDeleteDownloadFileAction(
    deleteFile: boolean,
    remember: boolean = false,
  ): Promise<void> {
    await this.updateAppSettings({
      deleteDownloadFileAction: deleteFile,
      rememberDeleteDownloadFileAction: remember,
    });
  },

  /** 下载模块：删除任务时是否同时删除本地文件 */
  async setDeleteDownloadHubFileAction(
    deleteFile: boolean,
    remember: boolean = false,
  ): Promise<void> {
    await this.updateAppSettings({
      deleteDownloadHubFileAction: deleteFile,
      rememberDeleteDownloadHubFileAction: remember,
    });
  },

  /** 下载模块：无本地文件任务删除时是否跳过确认 */
  async setSkipConfirmDeleteDownloadHubNoFile(skip: boolean): Promise<void> {
    await this.updateAppSettings({
      skipConfirmDeleteDownloadHubNoFile: skip,
    });
  },

  /** 下载模块：删除进行中/已暂停任务时是否同时删除本地临时文件 */
  async setDeleteDownloadHubInProgressFileAction(
    deleteFile: boolean,
    remember: boolean = false,
  ): Promise<void> {
    await this.updateAppSettings({
      deleteDownloadHubInProgressFileAction: deleteFile,
      rememberDeleteDownloadHubInProgressFileAction: remember,
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

  async setImportThemeKeepOptions(options: {
    importKeepThemeName?: boolean;
    importKeepThemeActive?: boolean;
    importOverwriteThemeAssets?: boolean;
    themesLibraryPath?: string;
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

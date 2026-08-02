/**
 * 桌面歌词窗口开闭（对齐 LX desktopLyric.enable）
 * 单一真相源：music-settings.desktopLyricEnabled
 */

import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
} from '@/lib/media/audio/music-settings';
import { isAndroid, isTauri } from '@/lib/platform/detect';

function useAndroidOverlay(): boolean {
  return isTauri() && isAndroid();
}

const ENABLED_EVENT = 'desktop-lyric-enabled-changed';
/** 主窗 open 后通知子窗：首帧就绪再 show */
const PREPARE_SHOW_EVENT = 'desktop-lyric-prepare-show';
/** 子窗 UI 已挂载，可接收 prepare-show */
const UI_READY_EVENT = 'desktop-lyric-ui-ready';
/** open 已完成、等待子窗首帧 show */
let pendingReveal = false;
/** 等待子窗 ui-ready 的 resolve 队列 */
const uiReadyWaiters: Array<() => void> = [];

let syncing = false;
let bootstrapped = false;
/** 取消过期的异步开窗，避免 close 后 open 才完成导致关不掉 */
let openGeneration = 0;
/** 窗口是否已预创建（隐藏态） */
let windowCreated = false;
/** 进行中的 open，避免 hydrate/restore 双触发互取消 */
let openInFlight: Promise<void> | null = null;
/** 启用但启动时尚无曲目：等有曲目后再恢复开窗，勿清掉 enable */
let pendingRestoreOpen = false;

function resolveUiReadyWaiters(): void {
  const waiters = uiReadyWaiters.splice(0, uiReadyWaiters.length);
  for (const w of waiters) w();
}

function waitForDesktopLyricUiReady(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const timer = window.setTimeout(() => done(false), timeoutMs);
    uiReadyWaiters.push(() => {
      window.clearTimeout(timer);
      done(true);
    });
  });
}

function getSettingsForWindow() {
  const s = getMusicSettings();
  return {
    width: s.desktopLyricWidth ?? 600,
    height: s.desktopLyricHeight ?? 200,
    x: s.desktopLyricX ?? null,
    y: s.desktopLyricY ?? null,
    showTaskbar: s.desktopLyricShowTaskbar ?? false,
    alwaysOnTop: s.desktopLyricAlwaysOnTop ?? true,
    alwaysOnTopLoop: s.desktopLyricAlwaysOnTopLoop ?? false,
    lockScreen: s.desktopLyricLockScreen ?? false,
    lockScreenUseWorkArea: s.desktopLyricLockScreenBounds !== 'screen',
  };
}

/** 预创建隐藏窗口（WebView 提前加载就绪），后续 show/hide 无需重建 */
async function invokePrecreate(): Promise<void> {
  if (useAndroidOverlay() || windowCreated) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('precreate_desktop_lyric_window', getSettingsForWindow());
  windowCreated = true;
}

async function invokeOpen(): Promise<void> {
  if (useAndroidOverlay()) {
    const {
      showAndroidDesktopLyric,
      ensureAndroidDesktopLyricBridge,
    } = await import('@/lib/media/audio/android-desktop-lyric');
    ensureAndroidDesktopLyricBridge();
    await showAndroidDesktopLyric();
    await syncDesktopLyricNativeState();
    return;
  }
  if (openInFlight) return openInFlight;
  openInFlight = (async () => {
    const wasWarm = windowCreated;
    const gen = ++openGeneration;
    const { invoke } = await import('@tauri-apps/api/core');
    // open 仅 ensure（保持隐藏）；显示由子窗首帧 / 主窗兜底 show
    await invoke('open_desktop_lyric_window', getSettingsForWindow());
    windowCreated = true;
    if (gen !== openGeneration || !getMusicSettings().desktopLyricEnabled) {
      await invoke('close_desktop_lyric_window');
      return;
    }
    await syncDesktopLyricNativeState();
    if (gen !== openGeneration || !getMusicSettings().desktopLyricEnabled) {
      await invoke('close_desktop_lyric_window');
      return;
    }
    pendingReveal = true;
    await revealDesktopLyricWindow(gen, wasWarm);
  })().finally(() => {
    openInFlight = null;
  });
  return openInFlight;
}

/**
 * 等子窗 UI 就绪后再 show；超时则主窗兜底。
 * 冷启动 WebView 加载远超数百毫秒；过早 show 会白屏，且主窗 waiters 需由主窗监听 UI_READY 唤醒。
 */
async function revealDesktopLyricWindow(
  gen: number,
  alreadyWarm: boolean,
): Promise<void> {
  if (!isTauri() || useAndroidOverlay()) return;
  await requestDesktopLyricReveal();
  if (alreadyWarm) {
    // 预创建子窗已在跑：prepare-show 即可本地 show，稍候主窗兜底
    await new Promise<void>((r) => window.setTimeout(r, 200));
  } else {
    const ready = await waitForDesktopLyricUiReady(5000);
    if (gen !== openGeneration || !pendingReveal) return;
    if (!getMusicSettings().desktopLyricEnabled) return;
    if (ready) {
      await requestDesktopLyricReveal();
      await new Promise<void>((r) => window.setTimeout(r, 80));
    }
  }
  if (gen !== openGeneration || !pendingReveal) return;
  if (!getMusicSettings().desktopLyricEnabled) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('show_desktop_lyric_window');
  } catch {
    /* ignore */
  }
  if (gen === openGeneration) pendingReveal = false;
}

/** 通知子窗在绘制完成后再显示；多次重试以防监听尚未挂上 */
async function requestDesktopLyricReveal(): Promise<void> {
  if (!isTauri() || useAndroidOverlay()) return;
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(PREPARE_SHOW_EVENT, {});
    window.setTimeout(() => {
      void emit(PREPARE_SHOW_EVENT, {}).catch(() => undefined);
    }, 200);
    window.setTimeout(() => {
      void emit(PREPARE_SHOW_EVENT, {}).catch(() => undefined);
    }, 800);
  } catch {
    /* ignore */
  }
}

/** 子窗 onMount 后调用：唤醒主窗等待队列并补发 prepare-show */
export async function notifyDesktopLyricUiReady(): Promise<void> {
  if (!isTauri() || useAndroidOverlay()) return;
  resolveUiReadyWaiters();
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(UI_READY_EVENT, {});
  } catch {
    /* ignore */
  }
}

/**
 * 子窗首帧就绪后调用：直接 show 当前 WebView（勿依赖子窗里可能未 hydrate 的 enable）。
 */
export async function showDesktopLyricWindowWhenReady(): Promise<void> {
  if (!isTauri() || useAndroidOverlay()) return;
  const { waitAuxWindowReady } = await import('@/lib/media/audio/aux-window-reveal');
  await waitAuxWindowReady({ frames: 2, fontTimeoutMs: 400, extraDelayMs: 32 });
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    await getCurrentWebviewWindow().show();
  } catch {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('show_desktop_lyric_window');
    } catch {
      /* ignore */
    }
  }
}

export function getDesktopLyricPrepareShowEvent(): string {
  return PREPARE_SHOW_EVENT;
}

async function invokeClose(): Promise<void> {
  openGeneration += 1;
  pendingReveal = false;
  if (useAndroidOverlay()) {
    const { hideAndroidDesktopLyric } = await import(
      '@/lib/media/audio/android-desktop-lyric'
    );
    await hideAndroidDesktopLyric();
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('close_desktop_lyric_window');
}

function broadcastEnabled(enabled: boolean): void {
  try {
    window.dispatchEvent(
      new CustomEvent(ENABLED_EVENT, { detail: { enabled } }),
    );
  } catch {
    /* ignore */
  }
  if (!isTauri()) return;
  void import('@tauri-apps/api/event')
    .then(({ emit }) => emit(ENABLED_EVENT, { enabled }))
    .catch(() => undefined);
}

/**
 * Hub 挂载时：若设置里已启用且有可播放曲目则恢复窗口；并监听跨窗 enable 变化。
 * @param hasTrack 当前是否有已加载的曲目——无曲目时延后开窗，但保留 enable（按钮状态）
 */
export function bootstrapDesktopLyricWindow(hasTrack = true): void {
  if (!isTauri() || bootstrapped) return;
  bootstrapped = true;

  void import('@tauri-apps/api/event').then(({ listen }) => {
    void listen<{ enabled?: boolean }>(ENABLED_EVENT, (e) => {
      if (syncing) return;
      const enabled = e.payload?.enabled === true;
      if (getMusicSettings().desktopLyricEnabled === enabled) return;
      syncing = true;
      setMusicSettings({ desktopLyricEnabled: enabled });
      syncing = false;
    });
    void listen(UI_READY_EVENT, () => {
      // 子窗在另一 WebView：必须在主窗侧唤醒 waiters
      resolveUiReadyWaiters();
      if (!pendingReveal || !getMusicSettings().desktopLyricEnabled) return;
      void requestDesktopLyricReveal();
    });
  });

  window.addEventListener(ENABLED_EVENT, ((e: CustomEvent<{ enabled?: boolean }>) => {
    if (syncing) return;
    const enabled = e.detail?.enabled === true;
    if (getMusicSettings().desktopLyricEnabled === enabled) return;
    syncing = true;
    setMusicSettings({ desktopLyricEnabled: enabled });
    syncing = false;
  }) as EventListener);

  // 设置 hydrate 后 enable 变为 true、或首屏竞态未显窗时补开
  subscribeMusicSettings((s) => {
    if (!bootstrapped) return;
    if (!s.desktopLyricEnabled) {
      pendingRestoreOpen = false;
      if (!syncing) void invokeClose();
      return;
    }
    void ensureDesktopLyricVisible().catch(() => undefined);
  });

  if (!getMusicSettings().desktopLyricEnabled) {
    pendingRestoreOpen = false;
    // 无论是否启用，都预创建隐藏窗口（WebView 预热），后续 show 即开即显
    schedulePrecreate();
    return;
  }

  // 会话尚未 hydrate 出曲目时：保留 enable（按钮高亮），等有曲目后再开窗
  if (!hasTrack) {
    pendingRestoreOpen = true;
    schedulePrecreate();
    return;
  }

  pendingRestoreOpen = false;
  scheduleDesktopLyricRestoreOpen();
}

/**
 * 曲目队列恢复后调用：若 bootstrap 时因无曲目延后了开窗，此时补开。
 */
export function notifyDesktopLyricTrackAvailability(hasTrack: boolean): void {
  if (!isTauri() || !bootstrapped) return;
  if (!hasTrack) return;
  if (!getMusicSettings().desktopLyricEnabled) {
    pendingRestoreOpen = false;
    return;
  }
  if (pendingRestoreOpen) {
    pendingRestoreOpen = false;
    scheduleDesktopLyricRestoreOpen();
    return;
  }
  // enable 已开但窗未显示（hydrate/首屏竞态）：补开
  void ensureDesktopLyricVisible().catch(() => undefined);
}

/** 若应显示却不可见，则开窗（避免重入正在进行的 reveal） */
async function ensureDesktopLyricVisible(): Promise<void> {
  if (!isTauri() || useAndroidOverlay()) return;
  if (!getMusicSettings().desktopLyricEnabled) return;
  if (pendingReveal) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const open = await invoke<boolean>('is_desktop_lyric_window_open');
    if (open) return;
  } catch {
    /* 查询失败则继续尝试 open */
  }
  await invokeOpen();
}

function schedulePrecreate(): void {
  const create = () => {
    void invokePrecreate().catch((err) =>
      console.warn('[desktop-lyric] precreate failed', err),
    );
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(create, { timeout: 3000 });
  } else {
    window.setTimeout(create, 1500);
  }
}

/** 主窗就绪后再恢复桌面歌词，避免与主 WebView 初始化抢锁卡死 */
function scheduleDesktopLyricRestoreOpen(): void {
  const open = () => {
    void ensureDesktopLyricVisible().catch((err) =>
      console.warn('[desktop-lyric] restore open failed', err),
    );
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(open, { timeout: 1200 });
  } else {
    window.setTimeout(open, 600);
  }
}

export function teardownDesktopLyricWindowSync(): void {
  bootstrapped = false;
  pendingRestoreOpen = false;
  if (useAndroidOverlay()) {
    void import('@/lib/media/audio/android-desktop-lyric').then((m) => {
      void m.hideAndroidDesktopLyric().catch(() => undefined);
      m.teardownAndroidDesktopLyricBridge();
    });
    return;
  }
  if (windowCreated && isTauri()) {
    windowCreated = false;
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('destroy_desktop_lyric_window'))
      .catch(() => undefined);
  }
}

/** 切换桌面歌词；先更新 enable（按钮立刻切换），再开/关窗 */
export async function setDesktopLyricEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  const prev = getMusicSettings().desktopLyricEnabled === true;

  syncing = true;
  setMusicSettings({ desktopLyricEnabled: enabled });
  syncing = false;
  broadcastEnabled(enabled);
  pendingRestoreOpen = false;

  try {
    if (enabled) {
      await invokeOpen();
    } else {
      await invokeClose();
    }
    // 再校验：仅「已关闭却仍可见」时再关；开启时勿用 is_visible 重入 invokeOpen
    // （open 先隐藏再 show，中途 is_visible=false 会抬升 openGeneration 把开窗取消）
    if (useAndroidOverlay()) {
      const { isAndroidDesktopLyricShown } = await import(
        '@/lib/media/audio/android-desktop-lyric'
      );
      const open = await isAndroidDesktopLyricShown();
      if (!enabled && open) await invokeClose();
    } else {
      const { invoke } = await import('@tauri-apps/api/core');
      const open = await invoke<boolean>('is_desktop_lyric_window_open');
      if (!enabled && open) await invokeClose();
    }
  } catch (err) {
    console.warn('[desktop-lyric] toggle failed', err);
    syncing = true;
    setMusicSettings({ desktopLyricEnabled: prev });
    syncing = false;
    broadcastEnabled(prev);
    throw err;
  }
}

export async function toggleDesktopLyricEnabled(): Promise<boolean> {
  const next = !getMusicSettings().desktopLyricEnabled;
  await setDesktopLyricEnabled(next);
  return next;
}

export function isDesktopLyricEnabled(): boolean {
  return getMusicSettings().desktopLyricEnabled === true;
}

/** 歌词窗关闭时回写（由 LyricDesktopPage 调用） */
export function notifyDesktopLyricWindowClosed(): void {
  if (syncing) return;
  openGeneration += 1;
  pendingRestoreOpen = false;
  if (!getMusicSettings().desktopLyricEnabled) {
    broadcastEnabled(false);
    return;
  }
  syncing = true;
  setMusicSettings({ desktopLyricEnabled: false });
  syncing = false;
  broadcastEnabled(false);
}

/**
 * 锁定/解锁桌面歌词：立即落盘并跨窗广播，同时同步原生态（可拖/可缩）。
 * 勿走防抖广播，否则主窗改锁定时歌词窗顶栏会长时间停在旧态。
 */
export async function setDesktopLyricLocked(locked: boolean): Promise<void> {
  if (!isTauri()) {
    setMusicSettings({ desktopLyricLocked: locked }, { persistImmediate: true });
    return;
  }
  setMusicSettings({ desktopLyricLocked: locked }, { persistImmediate: true });
  await syncDesktopLyricWindowOptions({ locked });
}

/** 将窗口选项同步到原生桌面歌词窗 */
export async function syncDesktopLyricWindowOptions(
  patch?: Partial<{
    alwaysOnTop: boolean;
    locked: boolean;
    showTaskbar: boolean;
    alwaysOnTopLoop: boolean;
    lockScreen: boolean;
    lockScreenUseWorkArea: boolean;
  }>,
): Promise<void> {
  if (!isTauri()) return;
  const s = getMusicSettings();
  if (useAndroidOverlay()) {
    const { syncAndroidDesktopLyricLock } = await import(
      '@/lib/media/audio/android-desktop-lyric'
    );
    await syncAndroidDesktopLyricLock().catch(() => undefined);
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_desktop_lyric_window_options', {
    alwaysOnTop: patch?.alwaysOnTop ?? s.desktopLyricAlwaysOnTop,
    locked: patch?.locked ?? s.desktopLyricLocked,
    showTaskbar: patch?.showTaskbar ?? s.desktopLyricShowTaskbar,
    alwaysOnTopLoop: patch?.alwaysOnTopLoop ?? s.desktopLyricAlwaysOnTopLoop,
    lockScreen: patch?.lockScreen ?? s.desktopLyricLockScreen,
    lockScreenUseWorkArea:
      patch?.lockScreenUseWorkArea ?? s.desktopLyricLockScreenBounds !== 'screen',
  }).catch(() => undefined);
}

/**
 * 开窗/显窗后按当前设置重放原生态（置顶、锁定、穿透等）。
 * close 会清掉穿透；预创建窗再次 show 时若不重放，需进设置页开关一次才生效。
 */
export async function syncDesktopLyricNativeState(): Promise<void> {
  if (!isTauri() || useAndroidOverlay()) {
    await syncDesktopLyricWindowOptions();
    return;
  }
  const s = getMusicSettings();
  const { invoke } = await import('@tauri-apps/api/core');
  await Promise.all([
    syncDesktopLyricWindowOptions(),
    invoke('set_desktop_lyric_penetrate_mode', {
      enabled: !!s.desktopLyricPenetrate,
      ignoreChrome: s.desktopLyricPenetrateIgnoreChrome ?? false,
    }).catch(() => undefined),
  ]);
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('desktop-lyric-native-resync', null);
  } catch {
    /* ignore */
  }
}

export async function clampDesktopLyricToScreen(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('clamp_desktop_lyric_to_screen').catch(() => undefined);
}

/**
 * 持久化窗口几何
 * @param opts.skipHeight 自动收缩期间跳过高度，保住还原用的展开高度
 */
export async function persistDesktopLyricGeometry(opts?: {
  skipHeight?: boolean;
}): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = getCurrentWebviewWindow();
    const [pos, size, factor] = await Promise.all([
      win.outerPosition(),
      win.innerSize(),
      win.scaleFactor(),
    ]);
    setMusicSettings({
      desktopLyricX: pos.x / factor,
      desktopLyricY: pos.y / factor,
      desktopLyricWidth: size.width / factor,
      ...(opts?.skipHeight ? {} : { desktopLyricHeight: size.height / factor }),
    });
  } catch {
    /* ignore */
  }
}

/** 主窗可订阅 enable 变化以刷新 Toggle（storage 跨 WebView 可能不可靠） */
export function subscribeDesktopLyricEnabled(
  listener: (enabled: boolean) => void,
): () => void {
  const onSettings = subscribeMusicSettings((s) => {
    listener(s.desktopLyricEnabled === true);
  });
  const onLocal = ((e: CustomEvent<{ enabled?: boolean }>) => {
    listener(e.detail?.enabled === true);
  }) as EventListener;
  window.addEventListener(ENABLED_EVENT, onLocal);
  let unlistenTauri: (() => void) | undefined;
  if (isTauri()) {
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen<{ enabled?: boolean }>(ENABLED_EVENT, (e) => {
        listener(e.payload?.enabled === true);
      }).then((fn) => {
        unlistenTauri = fn;
      });
    });
  }
  return () => {
    onSettings();
    window.removeEventListener(ENABLED_EVENT, onLocal);
    unlistenTauri?.();
  };
}

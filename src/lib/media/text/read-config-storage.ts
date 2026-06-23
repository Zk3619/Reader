/**
 * 阅读器 UI 配置持久化（对齐 Legado ReadBookConfig / readConfig.json）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';
import type { TextViewerUiConfig as ReadConfig } from '@/lib/media/text/reader-ui-config';

const STORAGE_KEY = 'reader_ui_config_v1';

/** Web localStorage 键前缀（与 {@link WebStorage} / settings.json 一致） */
const WEB_STORAGE_PREFIX = 'store_settings.json_';

/** 同会话同步镜像（Tauri config.json 异步加载后写入，供首帧 peek） */
const SESSION_MIRROR_KEY = 'reader_ui_config_v1_mirror';

let cached: ReadConfig | null = null;

function mirrorReaderUiConfigToSession(config: ReadConfig): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_MIRROR_KEY, JSON.stringify(config));
  } catch {
    /* ignore quota */
  }
}

function readSessionMirror(): ReadConfig | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_MIRROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReadConfig;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** 同步读取已持久化的阅读器 UI 配置（首帧主题，避免默认 theme 闪一下） */
export function peekReaderUiConfigSync(): ReadConfig | null {
  if (cached) return cached;
  const session = readSessionMirror();
  if (session) {
    cached = session;
    return session;
  }
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${WEB_STORAGE_PREFIX}${STORAGE_KEY}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReadConfig;
    if (parsed && typeof parsed === 'object') {
      cached = parsed;
      mirrorReaderUiConfigToSession(parsed);
      return parsed;
    }
  } catch (e) {
    console.warn('[read-config-storage] sync peek failed', e);
  }
  return null;
}

/** 应用启动时预加载（Tauri 从 config.json 异步读取并写入内存缓存） */
export async function warmReaderUiConfigCache(): Promise<ReadConfig | null> {
  return loadReaderUiConfig();
}

export async function loadReaderUiConfig(): Promise<ReadConfig | null> {
  if (cached) return cached;
  try {
    const parsed = await getStorage<ReadConfig>(STORAGE_KEY);
    if (parsed && typeof parsed === 'object') {
      cached = parsed;
      mirrorReaderUiConfigToSession(parsed);
      return parsed;
    }
  } catch (e) {
    console.warn('[read-config-storage] load failed', e);
  }
  return null;
}

export async function saveReaderUiConfig(config: ReadConfig): Promise<void> {
  cached = config;
  mirrorReaderUiConfigToSession(config);
  try {
    await setStorage(STORAGE_KEY, config);
  } catch (e) {
    console.warn('[read-config-storage] save failed', e);
  }
}

export function invalidateReaderUiConfigCache(): void {
  cached = null;
}

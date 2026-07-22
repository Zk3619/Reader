/**
 * MusicFree 插件全局设置（订阅源、自动更新）
 */

const KEY = 'reader_audio_mf_global_settings';

export type MfGlobalSettings = {
  /** 持久插件订阅 URL 列表 */
  pluginSubscribeUrls: string[];
  /** 启动时自动检查插件更新 */
  autoUpdatePlugin: boolean;
  /** 跳过版本号比对（仅比对脚本 hash） */
  notCheckPluginVersion: boolean;
  /** 歌词缺失时自动 search(..., 'lyric') */
  autoSearchLyric: boolean;
  /** WebDAV 恢复策略 */
  webdavRestoreMode: 'merge' | 'overwrite';
  /** WebDAV 恢复时重装插件 */
  webdavReinstallPlugins: boolean;
};

const DEFAULTS: MfGlobalSettings = {
  pluginSubscribeUrls: [],
  autoUpdatePlugin: false,
  notCheckPluginVersion: false,
  autoSearchLyric: true,
  webdavRestoreMode: 'merge',
  webdavReinstallPlugins: true,
};

const listeners = new Set<() => void>();

export function subscribeMfGlobalSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const l of listeners) l();
}

export function getMfGlobalSettings(): MfGlobalSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<MfGlobalSettings>;
    return {
      ...DEFAULTS,
      ...parsed,
      pluginSubscribeUrls: Array.isArray(parsed.pluginSubscribeUrls)
        ? parsed.pluginSubscribeUrls.filter((u) => typeof u === 'string' && u.trim())
        : [],
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setMfGlobalSettings(patch: Partial<MfGlobalSettings>): MfGlobalSettings {
  const next = { ...getMfGlobalSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  notify();
  return next;
}

export function addMfPluginSubscribeUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;
  const settings = getMfGlobalSettings();
  if (settings.pluginSubscribeUrls.includes(trimmed)) return;
  setMfGlobalSettings({
    pluginSubscribeUrls: [...settings.pluginSubscribeUrls, trimmed],
  });
}

export function removeMfPluginSubscribeUrl(url: string): void {
  const settings = getMfGlobalSettings();
  setMfGlobalSettings({
    pluginSubscribeUrls: settings.pluginSubscribeUrls.filter((u) => u !== url),
  });
}

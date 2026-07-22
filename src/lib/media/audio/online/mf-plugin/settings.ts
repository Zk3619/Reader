/**
 * MusicFree 插件设置键与用户变量
 */

const META_KEY = 'reader_audio_mf_plugin_meta';

export type MfPluginMetaEntry = {
  order: number;
  enabled: boolean;
  userVariables: Record<string, string>;
  /** 音源重定向：用另一插件的 getMediaSource（P2） */
  alternativePluginId?: string | null;
};

export type MfPluginMetaStore = Record<string, MfPluginMetaEntry>;

function readMetaStore(): MfPluginMetaStore {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MfPluginMetaStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMetaStore(store: MfPluginMetaStore): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function getMfPluginMeta(pluginId: string): MfPluginMetaEntry {
  const store = readMetaStore();
  const entry = store[pluginId];
  if (entry) {
    return {
      order: Number(entry.order) || 0,
      enabled: entry.enabled !== false,
      userVariables:
        entry.userVariables && typeof entry.userVariables === 'object'
          ? { ...entry.userVariables }
          : {},
      alternativePluginId: entry.alternativePluginId ?? null,
    };
  }
  return { order: 0, enabled: true, userVariables: {}, alternativePluginId: null };
}

export function setMfPluginMeta(
  pluginId: string,
  patch: Partial<MfPluginMetaEntry>,
): MfPluginMetaEntry {
  const store = readMetaStore();
  const prev = getMfPluginMeta(pluginId);
  const next: MfPluginMetaEntry = {
    ...prev,
    ...patch,
    userVariables: patch.userVariables
      ? { ...patch.userVariables }
      : prev.userVariables,
  };
  store[pluginId] = next;
  writeMetaStore(store);
  return next;
}

export function removeMfPluginMeta(pluginId: string): void {
  const store = readMetaStore();
  delete store[pluginId];
  writeMetaStore(store);
}

export function listMfPluginMetaStore(): MfPluginMetaStore {
  return readMetaStore();
}

export function getMfUserVariables(pluginId: string): Record<string, string> {
  return getMfPluginMeta(pluginId).userVariables;
}

export function setMfUserVariables(
  pluginId: string,
  vars: Record<string, string>,
): void {
  setMfPluginMeta(pluginId, { userVariables: vars });
}

export function getMfAlternativePluginId(pluginId: string): string | null {
  return getMfPluginMeta(pluginId).alternativePluginId ?? null;
}

export function setMfAlternativePluginId(
  pluginId: string,
  alternativePluginId: string | null,
): void {
  setMfPluginMeta(pluginId, { alternativePluginId });
}

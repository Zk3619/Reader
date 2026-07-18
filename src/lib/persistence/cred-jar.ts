/**
 * 跨模块 HTTP 凭据罐（Cookie / CF / 登录态）
 * 权威：localStorage（与 Legado 书源兼容）；不进 settings.json
 */

const MODULE_PREFIX = 'reader_cred_';

export type CredModule = 'reader' | 'music' | 'tv' | 'subscribe' | 'tts';

function key(module: CredModule, kind: string, id: string): string {
  return `${MODULE_PREFIX}${module}_${kind}_${id}`;
}

export function getCredJson<T>(module: CredModule, kind: string, id: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key(module, kind, id));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setCredJson(module: CredModule, kind: string, id: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key(module, kind, id), JSON.stringify(value));
  } catch {
    /* */
  }
}

export function getCredString(module: CredModule, kind: string, id: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key(module, kind, id));
  } catch {
    return null;
  }
}

export function setCredString(
  module: CredModule,
  kind: string,
  id: string,
  value: string,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key(module, kind, id), value);
  } catch {
    /* */
  }
}

export function removeCred(module: CredModule, kind: string, id: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key(module, kind, id));
  } catch {
    /* */
  }
}

/** 音乐 LX sync 鉴权 — 迁入 cred 罐，兼容旧键 */
const LEGACY_LX_AUTH = 'reader.lx.sync.authKeys';

/** LX sync 鉴权表：serverId → LxClientKeyInfo（或兼容旧扁平结构） */
export function loadMusicSyncAuthKeys(): Record<string, unknown> {
  const migrated = getCredJson<Record<string, unknown>>('music', 'sync_auth', 'keys');
  if (migrated) return migrated;
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LEGACY_LX_AUTH);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    setCredJson('music', 'sync_auth', 'keys', parsed);
    return parsed;
  } catch {
    return {};
  }
}

export function saveMusicSyncAuthKeys(all: Record<string, unknown>): void {
  setCredJson('music', 'sync_auth', 'keys', all);
  try {
    localStorage.setItem(LEGACY_LX_AUTH, JSON.stringify(all));
  } catch {
    /* */
  }
}

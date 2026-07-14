/**
 * UserApi 初始化策略与更新提示静音偏好
 */

export type UserApiInitMode = 'activeOnly' | 'allEnabled';

const INIT_MODE_KEY = 'reader_audio_user_api_init_mode';
const UPDATE_PREFS_KEY = 'reader_audio_user_api_update_prefs';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type UserApiScriptUpdatePref = {
  /** 该音源 7 天内不再提示更新 */
  snoozeUntil?: number;
  /** 忽略过的更新地址（忽略本次） */
  ignoredUpdateUrls?: string[];
};

export type UserApiUpdatePrefs = {
  /** 全局：7 天内不再检查更新提示 */
  globalMuteUntil?: number;
  scripts: Record<string, UserApiScriptUpdatePref>;
};

function readUpdatePrefs(): UserApiUpdatePrefs {
  try {
    const raw = localStorage.getItem(UPDATE_PREFS_KEY);
    if (!raw) return { scripts: {} };
    const parsed = JSON.parse(raw) as UserApiUpdatePrefs;
    return {
      globalMuteUntil: parsed.globalMuteUntil,
      scripts: parsed.scripts ?? {},
    };
  } catch {
    return { scripts: {} };
  }
}

function writeUpdatePrefs(prefs: UserApiUpdatePrefs): void {
  try {
    localStorage.setItem(UPDATE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function getUserApiInitMode(): UserApiInitMode {
  try {
    const v = localStorage.getItem(INIT_MODE_KEY);
    if (v === 'allEnabled' || v === 'activeOnly') return v;
  } catch {
    // ignore
  }
  return 'activeOnly';
}

export function setUserApiInitMode(mode: UserApiInitMode): void {
  try {
    localStorage.setItem(INIT_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

export function isUserApiUpdateGloballyMuted(now = Date.now()): boolean {
  const until = readUpdatePrefs().globalMuteUntil;
  return typeof until === 'number' && until > now;
}

export function setUserApiUpdateGlobalMute(days = 7): void {
  const prefs = readUpdatePrefs();
  prefs.globalMuteUntil = Date.now() + days * 24 * 60 * 60 * 1000;
  writeUpdatePrefs(prefs);
}

export function clearUserApiUpdateGlobalMute(): void {
  const prefs = readUpdatePrefs();
  delete prefs.globalMuteUntil;
  writeUpdatePrefs(prefs);
}

export function shouldSuppressUserApiUpdateAlert(input: {
  scriptId?: string;
  updateUrl?: string;
}): boolean {
  if (isUserApiUpdateGloballyMuted()) return true;
  const key = input.scriptId;
  if (!key) return false;
  const prefs = readUpdatePrefs();
  const scriptPref = prefs.scripts[key];
  if (!scriptPref) return false;
  if (typeof scriptPref.snoozeUntil === 'number' && scriptPref.snoozeUntil > Date.now()) {
    return true;
  }
  const url = input.updateUrl?.trim();
  if (url && scriptPref.ignoredUpdateUrls?.includes(url)) return true;
  return false;
}

export function snoozeUserApiScriptUpdate(scriptId: string, days = 7): void {
  const prefs = readUpdatePrefs();
  const cur = prefs.scripts[scriptId] ?? {};
  prefs.scripts[scriptId] = {
    ...cur,
    snoozeUntil: Date.now() + days * 24 * 60 * 60 * 1000,
  };
  writeUpdatePrefs(prefs);
}

export function ignoreUserApiScriptUpdate(scriptId: string, updateUrl: string): void {
  const url = updateUrl.trim();
  if (!url) return;
  const prefs = readUpdatePrefs();
  const cur = prefs.scripts[scriptId] ?? {};
  const ignored = new Set(cur.ignoredUpdateUrls ?? []);
  ignored.add(url);
  prefs.scripts[scriptId] = {
    ...cur,
    ignoredUpdateUrls: [...ignored],
  };
  writeUpdatePrefs(prefs);
}

export function applyUserApiUpdateDialogChoices(input: {
  globalMute7Days: boolean;
  items: Array<{
    scriptId: string;
    updateUrl: string;
    snooze7Days: boolean;
    ignoreThis: boolean;
  }>;
}): void {
  if (input.globalMute7Days) {
    setUserApiUpdateGlobalMute(7);
  }
  for (const item of input.items) {
    if (!item.scriptId) continue;
    if (item.snooze7Days) snoozeUserApiScriptUpdate(item.scriptId, 7);
    if (item.ignoreThis && item.updateUrl) {
      ignoreUserApiScriptUpdate(item.scriptId, item.updateUrl);
    }
  }
}

export { SEVEN_DAYS_MS };

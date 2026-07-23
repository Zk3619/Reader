/**
 * Bangumi API 偏好（镜像基址等）
 */

const KEY = 'reader.bangumi.meta.prefs.v1';

export type BangumiMetaPrefs = {
  /** 官方 api.bgm.tv */
  apiBase: string;
  /** next.bgm.tv（日历等） */
  apiNextBase: string;
  /** 可选镜像，空则不用 */
  mirrorBase: string;
  useMirror: boolean;
};

const DEFAULTS: BangumiMetaPrefs = {
  apiBase: 'https://api.bgm.tv',
  apiNextBase: 'https://next.bgm.tv',
  mirrorBase: 'https://api.kazumi.fyi',
  useMirror: false,
};

export function getBangumiMetaPrefs(): BangumiMetaPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<BangumiMetaPrefs>;
    return {
      ...DEFAULTS,
      ...p,
      apiBase: typeof p.apiBase === 'string' && p.apiBase.trim() ? p.apiBase.trim() : DEFAULTS.apiBase,
      apiNextBase:
        typeof p.apiNextBase === 'string' && p.apiNextBase.trim()
          ? p.apiNextBase.trim()
          : DEFAULTS.apiNextBase,
      mirrorBase:
        typeof p.mirrorBase === 'string' && p.mirrorBase.trim()
          ? p.mirrorBase.trim()
          : DEFAULTS.mirrorBase,
      useMirror: p.useMirror === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setBangumiMetaPrefs(patch: Partial<BangumiMetaPrefs>): BangumiMetaPrefs {
  const next = { ...getBangumiMetaPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

export function resolveBangumiApiBase(): string {
  const p = getBangumiMetaPrefs();
  if (p.useMirror && p.mirrorBase) return p.mirrorBase.replace(/\/$/, '');
  return p.apiBase.replace(/\/$/, '');
}

export function resolveBangumiNextBase(): string {
  const p = getBangumiMetaPrefs();
  if (p.useMirror && p.mirrorBase) return p.mirrorBase.replace(/\/$/, '');
  return p.apiNextBase.replace(/\/$/, '');
}

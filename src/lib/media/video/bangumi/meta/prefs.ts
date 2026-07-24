/**
 * Bangumi API 偏好（镜像基址等）
 * 持久化 → video_bangumi_prefs.key=meta
 */

import { BANGUMI_PREF_KEYS, setBangumiPrefJson } from '@/lib/media/video/bangumi/db/prefs-dao';
import {
  getCachedMetaPrefs,
  setCachedMetaPrefs,
} from '@/lib/media/video/bangumi/db/migrate-ls';

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

export function normalizeMetaPrefs(p: Partial<BangumiMetaPrefs> = {}): BangumiMetaPrefs {
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
}

export function getBangumiMetaPrefs(): BangumiMetaPrefs {
  return normalizeMetaPrefs(getCachedMetaPrefs() ?? DEFAULTS);
}

export function setBangumiMetaPrefs(patch: Partial<BangumiMetaPrefs>): BangumiMetaPrefs {
  const next = normalizeMetaPrefs({ ...getBangumiMetaPrefs(), ...patch });
  setCachedMetaPrefs(next);
  void setBangumiPrefJson(BANGUMI_PREF_KEYS.meta, next).catch((e) =>
    console.warn('[bangumi] save meta prefs failed', e),
  );
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

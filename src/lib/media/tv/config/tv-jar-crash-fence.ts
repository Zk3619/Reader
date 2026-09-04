/**
 * Android 影视加固 JAR 崩溃围栏：下次启动隔离该 JAR，避免闪退循环。
 * 与 TvJarCrashFence.kt 的 jarUrlKey / snapshot JSON 对齐。
 */

import { isAndroid } from '@/lib/platform/detect';

export type TvJarFenceEntry = {
  jarKey: string;
  jar: string;
  siteKey: string;
  api: string;
};

export type TvJarFenceSnapshot = {
  newlyAbsorbed: boolean;
  siteKey: string;
  api: string;
  jar: string;
  jarKey: string;
  phase: string;
  entries: TvJarFenceEntry[];
};

export const EMPTY_TV_JAR_FENCE: TvJarFenceSnapshot = {
  newlyAbsorbed: false,
  siteKey: '',
  api: '',
  jar: '',
  jarKey: '',
  phase: '',
  entries: [],
};

const QUARANTINE_TOAST_TITLE = '已禁用上次崩溃的影视源';
const QUARANTINE_TOAST_DESC =
  '影视 JAR 上次加载导致应用崩溃，已暂时禁用该加固源。可在设置中点「重新尝试加固源」。';

let snapshot: TvJarFenceSnapshot = EMPTY_TV_JAR_FENCE;
let bootOnce: Promise<TvJarFenceSnapshot> | null = null;

/** 对齐 TvJarCrashFence.jarUrlKey：去掉 `;md5;` 后缀并小写 */
export function tvJarUrlKey(jarSpec: string): string {
  const s = jarSpec.trim();
  if (!s) return '';
  const cut = s.toLowerCase().indexOf(';md5;');
  return (cut >= 0 ? s.slice(0, cut) : s).trim().toLowerCase();
}

export function getTvJarFenceSnapshot(): TvJarFenceSnapshot {
  return snapshot;
}

export function applyTvJarFenceSnapshot(next: TvJarFenceSnapshot): TvJarFenceSnapshot {
  snapshot = {
    newlyAbsorbed: Boolean(next.newlyAbsorbed),
    siteKey: next.siteKey ?? '',
    api: next.api ?? '',
    jar: next.jar ?? '',
    jarKey: next.jarKey ?? '',
    phase: next.phase ?? '',
    entries: Array.isArray(next.entries) ? next.entries : [],
  };
  return snapshot;
}

export function isTvJarQuarantined(jar?: string): boolean {
  const url = tvJarUrlKey(jar ?? '');
  if (!url || !snapshot.entries.length) return false;
  return snapshot.entries.some(
    (e) => tvJarUrlKey(e.jar) === url || e.jarKey === jar || tvJarUrlKey(e.jarKey) === url,
  );
}

export function parseTvJarFenceJson(raw: string): TvJarFenceSnapshot {
  try {
    const o = JSON.parse(raw) as Partial<TvJarFenceSnapshot> & {
      entries?: unknown;
    };
    const entries: TvJarFenceEntry[] = [];
    if (Array.isArray(o.entries)) {
      for (const item of o.entries) {
        if (!item || typeof item !== 'object') continue;
        const e = item as Partial<TvJarFenceEntry>;
        entries.push({
          jarKey: String(e.jarKey ?? ''),
          jar: String(e.jar ?? ''),
          siteKey: String(e.siteKey ?? ''),
          api: String(e.api ?? ''),
        });
      }
    }
    return applyTvJarFenceSnapshot({
      newlyAbsorbed: Boolean(o.newlyAbsorbed),
      siteKey: String(o.siteKey ?? ''),
      api: String(o.api ?? ''),
      jar: String(o.jar ?? ''),
      jarKey: String(o.jarKey ?? ''),
      phase: String(o.phase ?? ''),
      entries,
    });
  } catch {
    return applyTvJarFenceSnapshot(EMPTY_TV_JAR_FENCE);
  }
}

function toastIfAbsorbed(prev: TvJarFenceSnapshot): void {
  if (!prev.newlyAbsorbed) return;
  void import('@/components/shared/AppToasts').then(({ showAppToast }) => {
    showAppToast({
      title: QUARANTINE_TOAST_TITLE,
      description: QUARANTINE_TOAST_DESC,
      variant: 'warning',
    });
  });
}

/** 配置加载前调用：读隔离名单；若刚从崩溃恢复则 Toast 一次 */
export async function bootTvJarCrashFence(): Promise<TvJarFenceSnapshot> {
  if (!isAndroid()) return snapshot;
  if (bootOnce) return bootOnce;
  bootOnce = (async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const json = await invoke<string>('tv_jar_crash_fence');
      const next = parseTvJarFenceJson(json);
      toastIfAbsorbed(next);
      return next;
    } catch (e) {
      console.warn('[tv] crash fence boot', e);
      return snapshot;
    } finally {
      bootOnce = null;
    }
  })();
  return bootOnce;
}

/** 解除隔离（空 jarKey = 全部），允许再次按 FongMi 路径加载 */
export async function unquarantineTvJars(jarKey = ''): Promise<TvJarFenceSnapshot> {
  if (!isAndroid()) {
    return applyTvJarFenceSnapshot(EMPTY_TV_JAR_FENCE);
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const json = await invoke<string>('tv_jar_unquarantine', { jarKey });
  return parseTvJarFenceJson(json);
}

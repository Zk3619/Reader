/**
 * VodConfig 运行时单例（对齐 FongMi VodConfig）
 */

import { fetchConfigJson, isDepotConfig, parseConfigText, resolveConfigAssetUrl } from './decoder';
import type { Parse, Site, VodConfigJson, LiveSource } from '../types';
import * as TvDao from '../db/tv-dao';

let active: VodConfigJson | null = null;
let activeUrl = '';
let homeSiteKey = '';
let defaultParseName = '';

/** key -> { searchable, changeable } from DB */
let sitePrefCache = new Map<string, { searchable: number; changeable: number }>();

function normalizeExt(ext: unknown): string {
  if (ext == null || ext === '') return '';
  if (typeof ext === 'string') return ext;
  try {
    return JSON.stringify(ext);
  } catch {
    return String(ext);
  }
}

function normalizeSite(raw: Site, globalSpider?: string): Site {
  let jar = raw.jar || globalSpider || undefined;
  let api = String(raw.api ?? '');
  if (activeUrl) {
    if (jar && !jar.startsWith('http') && !jar.includes('://')) {
      const [path, md5] = jar.split(';md5;');
      const abs = resolveConfigAssetUrl(path!, activeUrl);
      jar = md5 ? `${abs};md5;${md5}` : abs;
    }
    if (
      !api.startsWith('http') &&
      !api.startsWith('csp_') &&
      (/\.js(\?|#|$)/i.test(api) || /\.py(\?|#|$)/i.test(api))
    ) {
      api = resolveConfigAssetUrl(api, activeUrl);
    }
  }
  const base: Site = {
    ...raw,
    key: String(raw.key ?? ''),
    name: String(raw.name ?? raw.key ?? ''),
    type: (Number(raw.type) || 0) as Site['type'],
    api,
    jar,
    // 配置里 ext 常为对象；Tauri/JAR 侧统一要 string
    ext: normalizeExt((raw as Site & { ext?: unknown }).ext),
    searchable: raw.searchable ?? 1,
    changeable: raw.changeable ?? 1,
  };
  const pref = sitePrefCache.get(base.key);
  if (pref) {
    base.searchable = pref.searchable;
    base.changeable = pref.changeable;
  }
  return base;
}

export function getVodConfig(): VodConfigJson | null {
  return active;
}

export function getConfigUrl(): string {
  return activeUrl;
}

export function getSites(): Site[] {
  return (active?.sites ?? []).filter((s) => s && !s.hide).map((s) =>
    normalizeSite(s, active?.spider),
  );
}

export function getSite(key: string): Site | undefined {
  return getSites().find((s) => s.key === key);
}

export function getHomeSite(): Site | undefined {
  const sites = getSites();
  if (!sites.length) return undefined;
  return sites.find((s) => s.key === homeSiteKey) ?? sites[0];
}

export function setHomeSiteKey(key: string): void {
  homeSiteKey = key;
}

export function getParses(): Parse[] {
  const list = active?.parses ?? [];
  if (!defaultParseName) return list;
  const preferred = list.filter((p) => p.name === defaultParseName);
  const rest = list.filter((p) => p.name !== defaultParseName);
  return [...preferred, ...rest];
}

export function getDefaultParseName(): string {
  return defaultParseName;
}

export function setDefaultParseName(name: string): void {
  defaultParseName = name;
  try {
    localStorage.setItem('tv.defaultParse', name);
  } catch {
    /* */
  }
  void import('@/lib/persistence/domains/tv-ui')
    .then((m) => m.persistTvUiNow())
    .catch(() => undefined);
}

/** 供 tv.ui 管线 hydrate 写入（不触发二次 persist） */
export function applyDefaultParseNameFromPersist(name: string): void {
  defaultParseName = name;
  try {
    if (name) localStorage.setItem('tv.defaultParse', name);
  } catch {
    /* */
  }
}

export function captureDefaultParseName(): string {
  return defaultParseName;
}

export function getFlags(): string[] {
  return active?.flags ?? [];
}

export function getLives(): LiveSource[] {
  return active?.lives ?? [];
}

export function getAds(): string[] {
  return active?.ads ?? [];
}

export function getHosts(): string[] {
  return active?.hosts ?? [];
}

export function getDanmaku(): string | undefined {
  const d = active?.danmaku;
  if (typeof d === 'string') return d;
  return undefined;
}

/** 从 DB 刷新站点偏好缓存（启动/设置改完后调用） */
export async function refreshSitePrefs(): Promise<void> {
  try {
    const rows = await TvDao.listSitePrefs();
    const next = new Map<string, { searchable: number; changeable: number }>();
    for (const r of rows) {
      next.set(r.key, { searchable: r.searchable, changeable: r.changeable });
    }
    sitePrefCache = next;
  } catch (e) {
    console.warn('[tv-config] refreshSitePrefs', e);
  }
}

/** 测试/预热：直接写入偏好缓存（不落库） */
export function seedSitePrefCache(
  prefs: Record<string, { searchable: number; changeable: number }>,
): void {
  sitePrefCache = new Map(Object.entries(prefs));
}

export async function updateSitePref(
  key: string,
  searchable: number,
  changeable: number,
): Promise<void> {
  await TvDao.setSitePref(key, searchable, changeable);
  sitePrefCache.set(key, { searchable, changeable });
}

function afterLoad(cfg: VodConfigJson): void {
  active = cfg;
  homeSiteKey = getSites()[0]?.key ?? '';
  try {
    defaultParseName = localStorage.getItem('tv.defaultParse') ?? cfg.parses?.[0]?.name ?? '';
  } catch {
    defaultParseName = cfg.parses?.[0]?.name ?? '';
  }
  void refreshSitePrefs();
}

export async function loadVodConfigFromUrl(url: string): Promise<VodConfigJson> {
  let cfg = await fetchConfigJson(url);
  if (isDepotConfig(cfg) && cfg.urls?.[0]?.url) {
    const first = cfg.urls[0].url;
    const resolved = first.startsWith('http')
      ? first
      : new URL(first, url).toString();
    cfg = await fetchConfigJson(resolved);
    activeUrl = resolved;
  } else {
    activeUrl = url;
  }
  afterLoad(cfg);
  await refreshSitePrefs();
  return cfg;
}

export function loadVodConfigFromText(text: string, name = 'pasted'): VodConfigJson {
  const cfg = parseConfigText(text, name.startsWith('http') ? name : '');
  activeUrl = name;
  afterLoad(cfg);
  void refreshSitePrefs();
  return cfg;
}

export function clearVodConfig(): void {
  active = null;
  activeUrl = '';
  homeSiteKey = '';
  sitePrefCache = new Map();
}

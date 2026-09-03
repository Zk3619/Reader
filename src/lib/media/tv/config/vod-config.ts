/**
 * VodConfig 运行时单例（对齐 FongMi VodConfig）
 */

import { fetchConfigJson, isDepotConfig, parseConfigText, resolveConfigAssetUrl } from './decoder';
import type { Parse, Site, VodConfigJson, LiveSource } from '../types';
import * as TvDao from '../db/tv-dao';
import {
  countRawLivesEntries,
  normalizeLives,
} from '../live/normalize-lives';
import {
  resolveHomeSiteKeyForConfig,
  setPersistedHomeSiteKey,
} from './tv-home-site';

let active: VodConfigJson | null = null;
let activeUrl = '';
let homeSiteKey = '';
let defaultParseName = '';
/** 原始 lives 条数（含无效占位），用于导入提示 */
let rawLivesCount = 0;
let liveNormalizeNote = '';

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

/**
 * 按站点 key 查找；未命中时再按显示名精确匹配。
 * 兼容收藏/历史里 site_key 误存为中文站名（旧迁移 / 部分接口配置）。
 */
export function getSite(key: string): Site | undefined {
  const k = (key || '').trim();
  if (!k) return undefined;
  const sites = getSites();
  const byKey = sites.find((s) => s.key === k);
  if (byKey) return byKey;
  const byName = sites.filter((s) => (s.name || '').trim() === k);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    return byName.find((s) => s.searchable !== 0) ?? byName[0];
  }
  return undefined;
}

/** 将可能是显示名的站点标识解析为配置里的 site.key */
export function resolveSiteKey(keyOrName: string): string {
  const raw = (keyOrName || '').trim();
  if (!raw) return '';
  return getSite(raw)?.key?.trim() || raw;
}

export function getHomeSite(): Site | undefined {
  const sites = getSites();
  if (!sites.length) return undefined;
  return sites.find((s) => s.key === homeSiteKey) ?? sites[0];
}

export function setHomeSiteKey(key: string): void {
  homeSiteKey = key;
  const url = activeUrl.trim();
  if (url && key) {
    setPersistedHomeSiteKey(url, key);
  }
}

/** 仅恢复内存（hydrate / 测试）；不触发落库 */
export function applyHomeSiteKeyFromPersist(key: string): void {
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
    if (name) localStorage.setItem('tv.defaultParse', name);
    else localStorage.removeItem('tv.defaultParse');
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
    else localStorage.removeItem('tv.defaultParse');
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

export function getRawLivesCount(): number {
  return rawLivesCount;
}

export function getLiveNormalizeNote(): string {
  return liveNormalizeNote;
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

async function afterLoad(cfg: VodConfigJson, baseUrl: string): Promise<VodConfigJson> {
  rawLivesCount = countRawLivesEntries(cfg.lives);
  const lives = await normalizeLives(cfg.lives, baseUrl, cfg.spider);
  if (rawLivesCount > 0 && lives.length === 0) {
    liveNormalizeNote =
      '配置含 lives 字段，但条目缺少 url / api / groups（常见于占位 {}），无法加载直播';
  } else if (rawLivesCount > lives.length) {
    liveNormalizeNote = `已忽略 ${rawLivesCount - lives.length} 条无效直播源`;
  } else {
    liveNormalizeNote = '';
  }
  const next: VodConfigJson = { ...cfg, lives };
  active = next;
  const sites = getSites();
  const configKey = (baseUrl || activeUrl || '').trim();
  homeSiteKey = await resolveHomeSiteKeyForConfig(configKey, sites);
  try {
    defaultParseName = localStorage.getItem('tv.defaultParse') ?? cfg.parses?.[0]?.name ?? '';
  } catch {
    defaultParseName = cfg.parses?.[0]?.name ?? '';
  }
  void refreshSitePrefs();
  // syncWallFromVodConfig 已弃用：影视壁纸能力待主题工作室接入
  return next;
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
  const next = await afterLoad(cfg, activeUrl);
  await refreshSitePrefs();
  return next;
}

export async function loadVodConfigFromText(
  text: string,
  name = 'pasted',
): Promise<VodConfigJson> {
  const cfg = parseConfigText(text, name.startsWith('http') ? name : '');
  activeUrl = name;
  const base = name.startsWith('http') ? name : '';
  const next = await afterLoad(cfg, base);
  await refreshSitePrefs();
  return next;
}

export function clearVodConfig(): void {
  active = null;
  activeUrl = '';
  homeSiteKey = '';
  sitePrefCache = new Map();
  rawLivesCount = 0;
  liveNormalizeNote = '';
}

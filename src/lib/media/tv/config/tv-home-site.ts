/**
 * 影视首页站点 key（对齐 fongmi Config.home）
 * 按配置 URL 记忆；LS 快路径 + video_sources.meta_json.home 落库
 */

import * as TvDao from '../db/tv-dao';
import { parseVideoSourceMeta } from '@/lib/database/video-sources';
import type { Site } from '../types';
import { isTvJarQuarantined } from './tv-jar-crash-fence';

/** 饭太硬等配置首项常为「点我切源」：不可浏览，不能作 homeContent 默认站 */
export type TvHomeSiteCandidate = Pick<
  Site,
  'key' | 'searchable' | 'changeable' | 'api' | 'jar'
>;

export function isTvBrowsableHomeSite(site: TvHomeSiteCandidate): boolean {
  if (site.searchable === 0 && site.changeable === 0) return false;
  const api = String(site.api ?? '').trim();
  // 切源占位 / 本地网盘配置 / 推送代理：不能作为 homeContent 默认站
  if (/^csp_(DouDouGuard|MyDriveGuard|PushGuard)$/i.test(api)) return false;
  if (isTvJarQuarantined(site.jar)) return false;
  return true;
}

/** 无记忆时挑选可拉首页的默认站点（跳过切源占位） */
export function pickDefaultHomeSiteKey(sites: TvHomeSiteCandidate[]): string {
  if (!sites.length) return '';
  const browsable = sites.filter(isTvBrowsableHomeSite);
  return (browsable[0] ?? sites[0])?.key ?? '';
}

const STORAGE_KEY = 'tv_home_site_by_url_v1';

type HomeSiteMap = Record<string, string>;

function loadMap(): HomeSiteMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HomeSiteMap;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: HomeSiteMap = {};
    for (const [url, key] of Object.entries(parsed)) {
      if (typeof url === 'string' && typeof key === 'string' && url && key) {
        out[url] = key;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function saveMap(map: HomeSiteMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* */
  }
}

let cached = loadMap();

/** 同步读取：优先 LS（启动/切源即时可用） */
export function getPersistedHomeSiteKey(configUrl: string): string {
  const url = (configUrl || '').trim();
  if (!url) return '';
  return cached[url] ?? '';
}

/** 写入 LS；可选同步到源库 meta.home */
export function setPersistedHomeSiteKey(
  configUrl: string,
  siteKey: string,
  opts?: { persistDb?: boolean },
): void {
  const url = (configUrl || '').trim();
  const key = (siteKey || '').trim();
  if (!url || !key) return;
  cached = { ...cached, [url]: key };
  saveMap(cached);
  if (opts?.persistDb !== false) {
    void persistHomeSiteKeyToDb(url, key).catch((e) =>
      console.warn('[tv] persist home site', e),
    );
  }
}

export async function persistHomeSiteKeyToDb(
  configUrl: string,
  siteKey: string,
): Promise<void> {
  const url = (configUrl || '').trim();
  const key = (siteKey || '').trim();
  if (!url || !key) return;
  const row = await TvDao.findVideoSourceByUrl(url);
  if (!row) return;
  const meta = parseVideoSourceMeta(row.metaJson);
  if (meta.home === key) return;
  await TvDao.upsertVideoSource({
    ...row,
    metaJson: JSON.stringify({ ...meta, home: key }),
    updatedAt: Date.now(),
  });
}

function resolvePersistedHomeSiteKey(
  sites: TvHomeSiteCandidate[],
  key: string | undefined,
): string {
  const k = (key ?? '').trim();
  if (!k) return '';
  const site = sites.find((s) => s.key === k);
  if (!site || !isTvBrowsableHomeSite(site)) return '';
  return k;
}

/** 配置加载时：LS → DB meta.home → 可浏览默认站 */
export async function resolveHomeSiteKeyForConfig(
  configUrl: string,
  sites: TvHomeSiteCandidate[],
): Promise<string> {
  const url = (configUrl || '').trim();
  if (!url || !sites.length) return pickDefaultHomeSiteKey(sites);

  const fromLs = resolvePersistedHomeSiteKey(sites, cached[url]);
  if (fromLs) return fromLs;

  try {
    const row = await TvDao.findVideoSourceByUrl(url);
    const fromDb = row ? parseVideoSourceMeta(row.metaJson).home : undefined;
    const resolved = resolvePersistedHomeSiteKey(sites, fromDb);
    if (resolved) {
      cached = { ...cached, [url]: resolved };
      saveMap(cached);
      return resolved;
    }
  } catch (e) {
    console.warn('[tv] resolve home site', e);
  }

  return pickDefaultHomeSiteKey(sites);
}

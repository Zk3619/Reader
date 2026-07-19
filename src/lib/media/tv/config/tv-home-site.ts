/**
 * 影视首页站点 key（对齐 fongmi Config.home）
 * 按配置 URL 记忆；LS 快路径 + video_sources.meta_json.home 落库
 */

import * as TvDao from '../db/tv-dao';
import { parseVideoSourceMeta } from '@/lib/database/video-sources';

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

/** 配置加载时：LS → DB meta.home → 空 */
export async function resolveHomeSiteKeyForConfig(
  configUrl: string,
  siteKeys: string[],
): Promise<string> {
  const url = (configUrl || '').trim();
  const allowed = new Set(siteKeys.filter(Boolean));
  if (!url || !allowed.size) return siteKeys[0] ?? '';

  const fromLs = cached[url];
  if (fromLs && allowed.has(fromLs)) return fromLs;

  try {
    const row = await TvDao.findVideoSourceByUrl(url);
    const fromDb = row ? parseVideoSourceMeta(row.metaJson).home : undefined;
    if (fromDb && allowed.has(fromDb)) {
      cached = { ...cached, [url]: fromDb };
      saveMap(cached);
      return fromDb;
    }
  } catch (e) {
    console.warn('[tv] resolve home site', e);
  }

  return siteKeys[0] ?? '';
}

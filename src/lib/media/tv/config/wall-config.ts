/**
 * WallConfig — 对齐 TV-fongmi WallConfig
 * - 接口 JSON 顶层 `wallpaper` 同步 URL
 * - 下载/本地 copy → wallpaper_0 缓存
 * - 探测 GIF / 视频 / 静态图
 * - 源库 wallpaper 列表供设置页 Combobox
 */

import JSON5 from 'json5';
import { resolveConfigAssetUrl } from './decoder';
import { tvRequest } from '../net/rules';
import { clearWallBytes, readWallBytes, writeWallBytes } from './wall-storage';
import type { VodConfigJson } from '../types';
import * as TvDao from '../db/tv-dao';
import {
  getTvWallUi,
  setTvWallConfigUrl,
  setTvWallDisplaySrc,
  setTvWallError,
  setTvWallLocalName,
  setTvWallLoading,
  setTvWallMode,
  setTvWallType,
  type TvWallType,
} from '@/stores/tv-hub/tv-wall-ui';
import { reportTvError } from '@/lib/media/tv/tv-user-error';

let vodWallUrl = '';
let lastLoadedUrl = '';

export function getVodWallUrl(): string {
  return vodWallUrl;
}

export function getWallConfigUrl(): string {
  return getTvWallUi().configUrl || vodWallUrl;
}

export function getWallDesc(): string {
  const ui = getTvWallUi();
  if (ui.mode === 'follow') return '跟随主程序';
  if (ui.mode === 'local' && ui.localName) return ui.localName;
  const url = getWallConfigUrl();
  if (!url) return '未设置';
  try {
    if (url.startsWith('http')) return new URL(url).hostname + new URL(url).pathname;
  } catch {
    /* */
  }
  return url.length > 48 ? `${url.slice(0, 48)}…` : url;
}

export interface LibraryWallpaperOption {
  sourceName: string;
  sourceUrl: string;
  wallpaperUrl: string;
  /** Combobox 展示：源名 · URL */
  label: string;
}

/** 罗列各影视源配置中的 wallpaper（有则列出，标明来源） */
export async function listLibraryWallpaperOptions(): Promise<LibraryWallpaperOption[]> {
  const library = await TvDao.listTvConfigLibrary();
  const out: LibraryWallpaperOption[] = [];
  const seen = new Set<string>();
  for (const row of library) {
    if (!row.json?.trim()) continue;
    let cfg: VodConfigJson;
    try {
      cfg = JSON5.parse(row.json) as VodConfigJson;
    } catch {
      continue;
    }
    const raw = typeof cfg.wallpaper === 'string' ? cfg.wallpaper.trim() : '';
    if (!raw) continue;
    const wallpaperUrl = resolveConfigAssetUrl(raw, row.url || '');
    if (!wallpaperUrl || seen.has(wallpaperUrl)) continue;
    seen.add(wallpaperUrl);
    const sourceName = row.name || row.url || '未命名源';
    out.push({
      sourceName,
      sourceUrl: row.url,
      wallpaperUrl,
      label: `${sourceName} · ${wallpaperUrl}`,
    });
  }
  return out;
}

/**
 * Vod 配置加载后同步 wallpaper 字段（对齐 VodConfig.initWall）
 * follow / builtin / local 只记录 vodWallUrl；url 模式才自动拉取
 */
export function syncWallFromVodConfig(cfg: VodConfigJson, baseUrl: string): void {
  const raw = typeof cfg.wallpaper === 'string' ? cfg.wallpaper.trim() : '';
  if (!raw) {
    vodWallUrl = '';
    return;
  }
  const abs = resolveConfigAssetUrl(raw, baseUrl || '');
  vodWallUrl = abs;
  const ui = getTvWallUi();
  if (ui.mode === 'follow' || ui.mode === 'builtin' || ui.mode === 'local') {
    return;
  }
  const needSync = !ui.configUrl || ui.configUrl === abs || lastLoadedUrl === abs;
  if (needSync || !ui.configUrl) {
    setTvWallConfigUrl(abs);
  }
  if (ui.mode === 'url' && abs) {
    void loadWallMedia(abs, { force: false });
  }
}

function sniffWall(
  bytes: Uint8Array,
  nameHint: string,
): { type: TvWallType; mime: string } {
  const lower = nameHint.toLowerCase();
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return { type: 1, mime: 'image/gif' };
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return { type: 2, mime: 'video/mp4' };
  }
  if (/\.(mp4|webm|mkv|mov|m4v)(\?|$)/i.test(lower)) {
    return { type: 2, mime: lower.includes('webm') ? 'video/webm' : 'video/mp4' };
  }
  if (/\.gif(\?|$)/i.test(lower)) return { type: 1, mime: 'image/gif' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { type: 0, mime: 'image/jpeg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { type: 0, mime: 'image/png' };
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { type: 0, mime: 'image/webp' };
  }
  return { type: 0, mime: 'image/jpeg' };
}

async function fetchWallBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith('file:') || (/^[a-z]:[\\/]/i.test(url) && !url.startsWith('http'))) {
    const { readBytes } = await import('@/lib/platform/fs/read-write');
    let path = url;
    if (url.startsWith('file:')) {
      path = decodeURIComponent(url.replace(/^file:\/\//i, '').replace(/^\/([a-z]:)/i, '$1'));
    }
    return new Uint8Array(await readBytes({ kind: 'path', value: path }));
  }
  const res = await tvRequest(url, {
    method: 'GET',
    timeout: 60_000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  const ab = await res.arrayBuffer();
  if (!ab.byteLength) throw new Error('壁纸文件为空');
  return new Uint8Array(ab);
}

async function applyWallBytes(bytes: Uint8Array, nameHint: string): Promise<void> {
  const { type, mime } = sniffWall(bytes, nameHint);
  await writeWallBytes(bytes);
  setTvWallType(type);
  const blob = new Blob([bytes as BlobPart], { type: mime });
  setTvWallDisplaySrc(URL.createObjectURL(blob));
  lastLoadedUrl = getTvWallUi().configUrl;
}

/** 解析 Combobox 展示项或裸 URL → 实际壁纸地址 */
export function resolveWallPickInput(
  input: string,
  options: LibraryWallpaperOption[],
): string {
  const t = input.trim();
  if (!t) return '';
  const hit = options.find((o) => o.label === t || o.wallpaperUrl === t);
  return hit?.wallpaperUrl ?? t;
}

/** 加载壁纸媒体（URL 模式） */
export async function loadWallMedia(
  url?: string,
  opts?: { force?: boolean },
): Promise<void> {
  const target = (url ?? getWallConfigUrl()).trim();
  if (!target) {
    setTvWallError(reportTvError('应用壁纸失败', '未设置壁纸地址'));
    return;
  }
  if (!opts?.force && target === lastLoadedUrl && getTvWallUi().displaySrc) {
    return;
  }
  setTvWallLoading(true);
  setTvWallError('');
  try {
    setTvWallMode('url');
    setTvWallConfigUrl(target);
    const bytes = await fetchWallBytes(target);
    await applyWallBytes(bytes, target);
  } catch (e) {
    setTvWallError(reportTvError('应用壁纸失败', e));
    console.warn('[tv-wall] load failed', e);
  } finally {
    setTvWallLoading(false);
  }
}

/** 从本地文件写入壁纸 */
export async function loadWallFromLocalFile(file: File): Promise<void> {
  setTvWallLoading(true);
  setTvWallError('');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.byteLength) throw new Error('文件为空');
    setTvWallMode('local');
    setTvWallLocalName(file.name);
    setTvWallConfigUrl(`file://${file.name}`);
    await applyWallBytes(bytes, file.name);
  } catch (e) {
    setTvWallError(reportTvError('选择本地壁纸失败', e));
  } finally {
    setTvWallLoading(false);
  }
}

/** 启动时恢复已缓存的自定义壁纸 */
export async function restoreWallFromCache(): Promise<void> {
  const ui = getTvWallUi();
  if (ui.mode === 'follow' || ui.mode === 'builtin') return;
  if (ui.mode !== 'url' && ui.mode !== 'local') return;
  const bytes = await readWallBytes();
  if (!bytes?.byteLength) {
    if (ui.mode === 'url' && ui.configUrl) void loadWallMedia(ui.configUrl, { force: true });
    return;
  }
  try {
    await applyWallBytes(bytes, ui.localName || ui.configUrl || 'wallpaper_0');
  } catch (e) {
    console.warn('[tv-wall] restore cache', e);
  }
}

/** 强制刷新当前 URL */
export async function refreshWallMedia(): Promise<void> {
  const url = getWallConfigUrl();
  if (!url || url.startsWith('file:')) {
    setTvWallError(
      reportTvError(
        '刷新壁纸失败',
        url?.startsWith('file:') ? '本地壁纸请重新选择文件' : '未设置壁纸地址',
      ),
    );
    return;
  }
  lastLoadedUrl = '';
  await loadWallMedia(url, { force: true });
}

export async function clearWallMedia(): Promise<void> {
  await clearWallBytes();
  setTvWallDisplaySrc('');
  lastLoadedUrl = '';
  setTvWallError('');
}

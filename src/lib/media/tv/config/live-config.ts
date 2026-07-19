/**
 * LiveConfig 运行时单例（对齐 fongmi LiveConfig）
 * 可与 Vod 配置 URL 不同；当 Live 为空或与 Vod 同 URL 时可由 Vod 的 lives 同步
 */

import { fetchConfigJson, parseConfigText } from './decoder';
import { normalizeLives, countRawLivesEntries } from '../live/normalize-lives';
import type { LiveSource, VodConfigJson } from '../types';

let active: VodConfigJson | null = null;
let activeUrl = '';
/** 当前 lives 是否来自 Vod 同步（同 URL） */
let syncedFromVod = false;
let liveNote = '';
let rawLivesCount = 0;

export function getLiveConfig(): VodConfigJson | null {
  return active;
}

export function getLiveConfigUrl(): string {
  return activeUrl;
}

export function isLiveSyncedFromVod(): boolean {
  return syncedFromVod;
}

export function getLiveSources(): LiveSource[] {
  return active?.lives ?? [];
}

export function getLiveConfigNote(): string {
  return liveNote;
}

export function getLiveRawCount(): number {
  return rawLivesCount;
}

/**
 * 对齐 fongmi LiveConfig.needSync：
 * Live 未配置、或 Live URL 为空、或与即将写入的 url 相同 → 允许从 Vod 同步
 */
export function liveNeedSync(vodUrl: string): boolean {
  if (!activeUrl) return true;
  if (!vodUrl) return false;
  return activeUrl === vodUrl || syncedFromVod;
}

async function applyParsed(
  cfg: VodConfigJson,
  url: string,
  opts?: { syncedFromVod?: boolean },
): Promise<VodConfigJson> {
  const lives = await normalizeLives(cfg.lives, url.startsWith('http') ? url : '', cfg.spider);
  rawLivesCount = countRawLivesEntries(cfg.lives);
  if (rawLivesCount > 0 && lives.length === 0) {
    liveNote =
      '配置含 lives 字段，但条目缺少 url / api / groups（常见于占位 {}），无法加载直播';
  } else if (rawLivesCount > lives.length) {
    liveNote = `已忽略 ${rawLivesCount - lives.length} 条无效直播源`;
  } else {
    liveNote = '';
  }
  const next: VodConfigJson = { ...cfg, lives };
  active = next;
  activeUrl = url;
  syncedFromVod = opts?.syncedFromVod === true;
  return next;
}

export async function loadLiveConfigFromUrl(url: string): Promise<VodConfigJson> {
  const cfg = await fetchConfigJson(url);
  return applyParsed(cfg, url, { syncedFromVod: false });
}

export async function loadLiveConfigFromText(
  text: string,
  name = 'pasted',
): Promise<VodConfigJson> {
  const base = name.startsWith('http') ? name : '';
  const cfg = parseConfigText(text, base);
  return applyParsed(cfg, name, { syncedFromVod: false });
}

/** 从已解析的 Vod 配置同步 lives（不改变独立 Live 源时的语义） */
export async function syncLivesFromVodConfig(
  cfg: VodConfigJson,
  vodUrl: string,
): Promise<VodConfigJson | null> {
  if (!liveNeedSync(vodUrl)) return null;
  return applyParsed(cfg, vodUrl, { syncedFromVod: true });
}

export function clearLiveConfig(): void {
  active = null;
  activeUrl = '';
  syncedFromVod = false;
  liveNote = '';
  rawLivesCount = 0;
}

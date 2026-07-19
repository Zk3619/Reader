/**
 * 影视/直播配置识别（对齐音源 identify）
 */

import { parseConfigText } from './decoder';
import { normalizeLives, countRawLivesEntries } from '../live/normalize-lives';
import type { VodConfigJson } from '../types';
import type { TvConfigType } from './tv-config-kind';
import { TV_CONFIG_TYPE_LIVE, TV_CONFIG_TYPE_VOD } from './tv-config-kind';

export interface IdentifiedTvConfig {
  id: string;
  name: string;
  /** 来源标识：http url / file:name / pasted */
  url: string;
  json: string;
  siteCount: number;
  /** 规范化后可用直播条数 */
  liveCount: number;
  rawLiveCount: number;
  contentHash: string;
  /** 建议导入类型（可多选时用） */
  suggestedTypes: TvConfigType[];
  fileName?: string;
}

function simpleHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function normalizeJsonText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

export function deriveTvConfigDisplayName(
  urlOrName: string,
  cfg: VodConfigJson,
): string {
  const notice = (cfg.notice ?? '').trim();
  if (notice) return notice.slice(0, 48);
  try {
    if (urlOrName.startsWith('http')) return new URL(urlOrName).hostname;
  } catch {
    /* */
  }
  const base = urlOrName.replace(/^file:/, '').split(/[/\\]/).pop() || urlOrName;
  return base.slice(0, 48) || '影视配置';
}

async function identifyOne(
  text: string,
  url: string,
  fileName?: string,
): Promise<IdentifiedTvConfig | null> {
  const normalized = normalizeJsonText(text);
  if (!normalized) return null;
  try {
    const baseUrl = url.startsWith('http') ? url : '';
    const cfg = parseConfigText(normalized, baseUrl);
    const lives = await normalizeLives(cfg.lives, baseUrl, cfg.spider);
    const siteCount = (cfg.sites ?? []).filter((s) => s && !s.hide).length;
    const liveCount = lives.length;
    const rawLiveCount = countRawLivesEntries(cfg.lives);
    const suggestedTypes: TvConfigType[] = [];
    if (siteCount > 0 || (cfg.urls?.length ?? 0) > 0) {
      suggestedTypes.push(TV_CONFIG_TYPE_VOD);
    }
    if (liveCount > 0 || (siteCount === 0 && rawLiveCount > 0)) {
      suggestedTypes.push(TV_CONFIG_TYPE_LIVE);
    }
    if (!suggestedTypes.length) {
      // 空壳也允许导入为影视（用户可能后续用）
      suggestedTypes.push(TV_CONFIG_TYPE_VOD);
    }
    const json = JSON.stringify({ ...cfg, lives });
    const id = `${simpleHash(normalized)}:${url}`;
    return {
      id,
      name: deriveTvConfigDisplayName(fileName || url, cfg),
      url,
      json,
      siteCount,
      liveCount,
      rawLiveCount,
      contentHash: simpleHash(normalizeJsonText(json)),
      suggestedTypes,
      fileName,
    };
  } catch {
    return null;
  }
}

export async function identifyTvConfigFromText(
  text: string,
  url: string,
  fileName?: string,
): Promise<IdentifiedTvConfig | null> {
  return identifyOne(text, url, fileName);
}

export async function identifyTvConfigsFromFiles(
  files: File[],
): Promise<IdentifiedTvConfig[]> {
  const out: IdentifiedTvConfig[] = [];
  for (const file of files) {
    const text = await file.text();
    const url = `file:${file.name}`;
    const one = await identifyOne(text, url, file.name);
    if (one) out.push(one);
  }
  return out;
}

export async function identifyTvConfigsFromCode(
  raw: string,
): Promise<IdentifiedTvConfig[]> {
  const text = normalizeJsonText(raw);
  if (!text) return [];
  // 仓库 depot：可能是 { urls: [...] } 无 sites
  const one = await identifyOne(text, 'pasted');
  return one ? [one] : [];
}

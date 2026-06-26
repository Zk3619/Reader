/**
 * HttpTTS 导入/导出（对齐 Legado SpeakEngineDialog）
 */

import { getAllHttpTTS, upsertHttpTTS } from '@/lib/database/http-tts';
import type { HttpTTS } from '@/types';
import { isJsHttpTtsUrl } from '@/lib/media/text/http-tts-analyze';
import defaultHttpTtsData from '@/assets/default-http-tts.json';

export type HttpTtsImportItem = Partial<HttpTTS> & { name: string; url: string };

export type HttpTtsImportResult = {
  imported: number;
  skipped: number;
  conflicts: number;
};

function normalizeHttpTtsItem(raw: HttpTtsImportItem, fallbackId?: number): HttpTTS {
  const id = raw.id != null && Number.isFinite(Number(raw.id))
    ? Number(raw.id)
    : fallbackId ?? Date.now();
  return {
    id,
    name: String(raw.name ?? '未命名'),
    url: String(raw.url ?? ''),
    contentType: raw.contentType ? String(raw.contentType) : undefined,
    concurrentRate: raw.concurrentRate ? String(raw.concurrentRate) : '0',
    loginUrl: raw.loginUrl ? String(raw.loginUrl) : undefined,
    loginUi: raw.loginUi
      ? typeof raw.loginUi === 'string'
        ? raw.loginUi
        : JSON.stringify(raw.loginUi)
      : undefined,
    header: raw.header ? String(raw.header) : undefined,
    jsLib: raw.jsLib ? String(raw.jsLib) : undefined,
    enabledCookieJar: Boolean(raw.enabledCookieJar),
    loginCheckJs: raw.loginCheckJs ? String(raw.loginCheckJs) : undefined,
    lastUpdateTime: raw.lastUpdateTime ?? Date.now(),
  };
}

export function parseHttpTtsJson(text: string): HttpTtsImportItem[] {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('HttpTTS 数据应为 JSON 数组');
  }
  return parsed as HttpTtsImportItem[];
}

export async function importHttpTtsFromJson(
  text: string,
  options?: { overwrite?: boolean },
): Promise<HttpTtsImportResult> {
  const items = parseHttpTtsJson(text);
  const existing = await getAllHttpTTS();
  const existingIds = new Set(existing.map((e) => e.id));
  let imported = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const item of items) {
    const normalized = normalizeHttpTtsItem(item);
    if (existingIds.has(normalized.id) && !options?.overwrite) {
      conflicts++;
      continue;
    }
    if (!normalized.name.trim() || !normalized.url.trim()) {
      skipped++;
      continue;
    }
    await upsertHttpTTS(normalized);
    existingIds.add(normalized.id);
    imported++;
  }

  return { imported, skipped, conflicts };
}

export async function importHttpTtsFromUrl(
  url: string,
  options?: { overwrite?: boolean },
): Promise<HttpTtsImportResult> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载失败: ${res.status}`);
  }
  const text = await res.text();
  return importHttpTtsFromJson(text, options);
}

export async function exportHttpTtsToJson(ids?: number[]): Promise<string> {
  const all = await getAllHttpTTS();
  const selected =
    ids && ids.length > 0 ? all.filter((e) => ids.includes(e.id)) : all;
  return JSON.stringify(selected, null, 2);
}

export async function importDefaultHttpTts(
  options?: { overwrite?: boolean },
): Promise<HttpTtsImportResult> {
  return importHttpTtsFromJson(JSON.stringify(defaultHttpTtsData), options);
}

export function httpTtsWebPlaybackSupport(url: string): 'full' | 'limited' | 'unsupported' {
  if (isJsHttpTtsUrl(url)) return 'unsupported';
  if (url.includes('loginCheckJs') || url.includes('@js')) return 'limited';
  return 'full';
}

export function getHttpTtsLoginStorageKey(id: number): string {
  return `http_tts_login_${id}`;
}

export function loadHttpTtsLoginInfo(id: number): Record<string, string> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getHttpTtsLoginStorageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveHttpTtsLoginInfo(id: number, info: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(getHttpTtsLoginStorageKey(id), JSON.stringify(info));
}

export function clearHttpTtsLoginInfo(id: number): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(getHttpTtsLoginStorageKey(id));
}

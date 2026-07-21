/**
 * 影视片单导入 / 导出（对齐书架书单 JSON）
 */

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { isTauri } from '@/lib/platform/detect';
import { SaveTextFileCancelledError } from '@/lib/export/save-text-file';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import { buildTvKeepDisplayMeta } from '@/lib/media/tv/tv-keep-meta';
import type { TvKeepRow } from '@/lib/media/tv/types';
import {
  rememberExportFilePath,
  resolveExportDialogDefaultPath,
  resolveSilentExportFilePath,
} from '@/lib/export/export-location';

export type TvKeepExportFormat = 'json' | 'txt';

export interface TvKeepPlaylistEntry {
  siteKey: string;
  vodId: string;
  vodName: string;
  vodPic?: string;
  kind?: 'vod' | 'live' | 'local';
}

export function isTvKeepExportCancelled(e: unknown): boolean {
  return e instanceof SaveTextFileCancelledError;
}

async function saveKeepFile(defaultFileName: string, content: string, ext: 'json' | 'txt') {
  if (isTauri()) {
    const silentPath = await resolveSilentExportFilePath('video', defaultFileName);
    if (silentPath) {
      const encoder = new TextEncoder();
      await writeFile(silentPath, encoder.encode(content));
      await rememberExportFilePath(silentPath);
      return;
    }
    const defaultPath = await resolveExportDialogDefaultPath(defaultFileName);
    const path = await save({
      defaultPath,
      filters: [{ name: ext === 'json' ? 'JSON' : 'Text', extensions: [ext] }],
    });
    if (!path) throw new SaveTextFileCancelledError();
    const encoder = new TextEncoder();
    await writeFile(path, encoder.encode(content));
    await rememberExportFilePath(path);
    return;
  }
  const blob = new Blob([content], {
    type: ext === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = defaultFileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildTxt(rows: TvKeepRow[]): string {
  const lines = rows.map((row, i) => {
    const meta = buildTvKeepDisplayMeta(row);
    const bits = [
      `${i + 1}. ${row.vodName || '未命名'}`,
      row.kind === 'live' ? '[直播]' : row.kind === 'local' ? '[本地]' : '[点播]',
      meta.subtitle || undefined,
      `site=${row.siteKey}`,
      `id=${row.vodId}`,
    ].filter(Boolean);
    return bits.join(' · ');
  });
  return [`# Reader 影视片单`, `# 共 ${rows.length} 条`, '', ...lines, ''].join('\n');
}

function buildJson(rows: TvKeepRow[]): string {
  const payload = {
    type: 'reader-tv-playlist',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: rows.length,
    items: rows.map((row) => {
      const meta = buildTvKeepDisplayMeta(row);
      return {
        siteKey: row.siteKey,
        siteName: meta.siteName || undefined,
        vodId: row.vodId,
        vodName: row.vodName,
        vodPic: row.vodPic || undefined,
        kind: row.kind,
      } satisfies TvKeepPlaylistEntry & { siteName?: string };
    }),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export async function exportTvKeepCache(
  rows: TvKeepRow[],
  format: TvKeepExportFormat = 'json',
): Promise<{ count: number; format: TvKeepExportFormat }> {
  if (!rows.length) throw new Error('没有可导出的片单');
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'txt') {
    await saveKeepFile(`tv-playlist-${stamp}.txt`, buildTxt(rows), 'txt');
  } else {
    await saveKeepFile(`tv-playlist-${stamp}.json`, buildJson(rows), 'json');
  }
  return { count: rows.length, format };
}

/** @deprecated 使用 exportTvKeepCache */
export const exportTvKeepPlaylist = exportTvKeepCache;

function normalizeEntry(raw: Record<string, unknown>): TvKeepPlaylistEntry | null {
  const siteKey = String(raw.siteKey ?? raw.site ?? '').trim();
  const vodId = String(raw.vodId ?? raw.id ?? raw.url ?? '').trim();
  const vodName = String(raw.vodName ?? raw.name ?? vodId).trim();
  if (!siteKey || !vodId) return null;
  const kindRaw = String(raw.kind ?? 'vod');
  const kind =
    kindRaw === 'live' || kindRaw === 'local' || kindRaw === 'vod' ? kindRaw : 'vod';
  return {
    siteKey,
    vodId,
    vodName: vodName || vodId,
    vodPic: raw.vodPic != null ? String(raw.vodPic) : undefined,
    kind,
  };
}

export function parseTvKeepPlaylistJson(text: string): TvKeepPlaylistEntry[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const data = JSON.parse(trimmed) as unknown;
  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { items?: unknown }).items)
      ? ((data as { items: unknown[] }).items)
      : [];
  const out: TvKeepPlaylistEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const entry = normalizeEntry(item as Record<string, unknown>);
    if (entry) out.push(entry);
  }
  return out;
}

export async function loadTvKeepPlaylistText(source: string): Promise<string> {
  const value = source.trim();
  if (/^https?:\/\//i.test(value)) {
    const res = await fetch(value);
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
    return await res.text();
  }
  return value;
}

export async function importTvKeepPlaylist(
  source: string,
): Promise<{ added: number; skipped: number; failed: number; errors: string[] }> {
  const text = await loadTvKeepPlaylistText(source);
  const entries = parseTvKeepPlaylistJson(text);
  if (!entries.length) throw new Error('未解析到有效片单条目');

  const existing = new Set((await TvDao.listKeep()).map((k) => k.key));
  let added = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    const key = `${entry.siteKey}$${entry.vodId}`;
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }
    try {
      await TvDao.upsertKeep({
        key,
        siteKey: entry.siteKey,
        vodId: entry.vodId,
        vodName: entry.vodName,
        vodPic: entry.vodPic ?? '',
        kind: entry.kind ?? 'vod',
        cid: 0,
        createdAt: Date.now(),
      });
      existing.add(key);
      added += 1;
    } catch (e) {
      failed += 1;
      errors.push(`${entry.vodName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { added, skipped, failed, errors };
}

export function makeLocalKeepKey(pathOrUrl: string): string {
  return `local$${pathOrUrl}`;
}

export async function addLocalKeepFromPath(
  pathOrUrl: string,
  displayName?: string,
): Promise<TvKeepRow> {
  const vodId = pathOrUrl.trim();
  if (!vodId) throw new Error('路径为空');
  const name =
    displayName?.trim() ||
    vodId.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ||
    '本地视频';
  const key = makeLocalKeepKey(vodId);
  const row: TvKeepRow = {
    key,
    siteKey: 'local',
    vodId,
    vodName: name,
    vodPic: '',
    kind: 'local',
    cid: 0,
    createdAt: Date.now(),
  };
  await TvDao.upsertKeep(row);
  return row;
}

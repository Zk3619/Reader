/**
 * 书源 Web API（对齐 Legado BookSourceController.kt）
 */

import * as sourcesDb from '@/lib/database/sources';
import { parseBookSourceJson } from '@/lib/book-source/source-import';
import { deleteBookSourceWithSessionPurge } from '@/lib/book-source/purge-source-session';
import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';
import { queryParam } from '@/lib/web-api/query';
import type { BookSource, NewBookSource } from '@/types';

function parseSingleBookSource(raw: string | null): NewBookSource | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const text = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
    return parseBookSourceJson(text)[0] ?? null;
  } catch {
    return null;
  }
}

function parseBookSourceList(raw: string | null): NewBookSource[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const text = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
    return parseBookSourceJson(text);
  } catch {
    return [];
  }
}

export async function getAllBookSourcesApi(): Promise<LegadoReturnData<BookSource[]>> {
  const sources = await sourcesDb.getAllSources();
  if (sources.length === 0) return legadoErr('设备源列表为空');
  return legadoOk(sources);
}

export async function getBookSourceApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<BookSource>> {
  const url = queryParam(query, 'url');
  if (!url) return legadoErr('未找到源，请检查书源地址');
  const source = await sourcesDb.getSource(url);
  if (!source) return legadoErr('未找到源，请检查书源地址');
  return legadoOk(source);
}

export async function saveBookSourceApi(postData: string | null): Promise<LegadoReturnData<null>> {
  const source = parseSingleBookSource(postData);
  if (!source?.sourceUrl?.trim() || !source.sourceName?.trim()) {
    return legadoErr('格式不对');
  }
  await sourcesDb.insertSource(source);
  return legadoOk(null);
}

export async function saveBookSourcesApi(
  postData: string | null,
): Promise<LegadoReturnData<NewBookSource[]>> {
  const sources = parseBookSourceList(postData);
  if (sources.length === 0) return legadoErr('转换源失败');
  const saved: NewBookSource[] = [];
  for (const source of sources) {
    if (!source.sourceUrl?.trim() || !source.sourceName?.trim()) continue;
    await sourcesDb.insertSource(source);
    saved.push(source);
  }
  if (saved.length === 0) return legadoErr('转换源失败');
  return legadoOk(saved);
}

export async function deleteBookSourcesApi(postData: string | null): Promise<LegadoReturnData<string>> {
  const sources = parseBookSourceList(postData);
  if (sources.length === 0) return legadoErr('格式不对');
  for (const item of sources) {
    const url = item.sourceUrl?.trim();
    if (!url) continue;
    const existing = await sourcesDb.getSource(url);
    if (existing) {
      await deleteBookSourceWithSessionPurge(existing);
    }
  }
  return legadoOk('已执行');
}

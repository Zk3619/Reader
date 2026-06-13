/**
 * 订阅源调试 Web API（对齐 Legado rssSourceDebug REST 版）
 */

import { parseRssSourceJson } from '@/lib/book-source/import-rss-source';
import { startRssSourceDebug } from '@/lib/rss-source/rss-source-debug';
import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';
import type { RssSource } from '@/types';

export interface RssSourceDebugLogEntry {
  state: number;
  message: string;
}

export interface RssSourceDebugResult {
  logs: RssSourceDebugLogEntry[];
  snapshots: {
    listHtml?: string;
    contentHtml?: string;
  };
}

function parseDebugRssSource(raw: unknown): RssSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.sourceUrl !== 'string') return null;
  try {
    const text = JSON.stringify([raw]);
    const parsed = parseRssSourceJson(text);
    return (parsed[0] ?? null) as RssSource | null;
  } catch {
    return null;
  }
}

export async function debugRssSourceApi(
  postData: string | null,
): Promise<LegadoReturnData<RssSourceDebugResult>> {
  if (!postData?.trim()) return legadoErr('数据不能为空');

  let payload: { source?: unknown; key?: string };
  try {
    payload = JSON.parse(postData) as { source?: unknown; key?: string };
  } catch {
    return legadoErr('格式不对');
  }

  const key = payload.key ?? '';
  let source = parseDebugRssSource(payload.source);
  if (!source && typeof payload.source === 'string') {
    try {
      const parsed = parseRssSourceJson(payload.source);
      source = (parsed[0] ?? null) as RssSource | null;
    } catch {
      return legadoErr('订阅源格式不对');
    }
  }
  if (!source?.sourceUrl?.trim()) return legadoErr('订阅源格式不对');

  const logs: RssSourceDebugLogEntry[] = [];
  const snapshots = await startRssSourceDebug(source, key, (state, message) => {
    logs.push({ state, message });
  });

  return legadoOk({ logs, snapshots });
}

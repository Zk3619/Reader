/**
 * 书源调试 Web API（对齐 Legado BookSourceDebugWebSocket，REST 同步版）
 */

import { parseBookSourceJson } from '@/lib/book-source/source-import';
import {
  legadoEditToBookSource,
  parseLegadoEditFromText,
  type LegadoEditSource,
} from '@/lib/book-source/legado-source-editor';
import {
  startBookSourceDebug,
  type BookSourceDebugSnapshots,
} from '@/lib/book-source/book-source-debug';
import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';
import type { BookSource } from '@/types';

export interface BookSourceDebugLogEntry {
  state: number;
  message: string;
}

export interface BookSourceDebugResult {
  logs: BookSourceDebugLogEntry[];
  snapshots: BookSourceDebugSnapshots;
}

function parseDebugSource(raw: unknown): BookSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.bookSourceUrl === 'string' || typeof obj.sourceUrl === 'string') {
    try {
      if (typeof obj.bookSourceUrl === 'string') {
        return legadoEditToBookSource(obj as unknown as LegadoEditSource);
      }
      const text = JSON.stringify([raw]);
      const parsed = parseBookSourceJson(text);
      return parsed[0] ? { ...parsed[0], sourceType: Number(parsed[0].sourceType ?? 0) } as BookSource : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function debugBookSourceApi(
  postData: string | null,
): Promise<LegadoReturnData<BookSourceDebugResult>> {
  if (!postData?.trim()) return legadoErr('数据不能为空');

  let payload: { source?: unknown; key?: string };
  try {
    payload = JSON.parse(postData) as { source?: unknown; key?: string };
  } catch {
    return legadoErr('格式不对');
  }

  const key = payload.key?.trim();
  if (!key) return legadoErr('调试关键字不能为空');

  let source = parseDebugSource(payload.source);
  if (!source && payload.source && typeof payload.source === 'string') {
    try {
      source = legadoEditToBookSource(parseLegadoEditFromText(payload.source));
    } catch {
      return legadoErr('书源格式不对');
    }
  }
  if (!source?.sourceUrl?.trim()) return legadoErr('书源格式不对');

  const logs: BookSourceDebugLogEntry[] = [];
  const snapshots = await startBookSourceDebug(source, key, (state, message) => {
    logs.push({ state, message });
  });

  return legadoOk({ logs, snapshots });
}

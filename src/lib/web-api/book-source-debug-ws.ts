/**
 * 书源调试 WebSocket 处理（对齐 Legado BookSourceDebugWebSocket）
 */

import * as sourcesDb from '@/lib/database/sources';
import { legadoEditToBookSource } from '@/lib/book-source/legado-source-editor';
import {
  cancelBookSourceDebug,
  startBookSourceDebug,
} from '@/lib/book-source/book-source-debug';
import { parseLegadoEditFromText } from '@/lib/book-source/legado-source-editor';
import type { BookSource } from '@/types';

export interface BookSourceDebugWsMessage {
  tag?: string;
  key?: string;
  source?: unknown;
}

const NOT_PRINT_STATES = new Set([10, 20, 30, 40]);

async function resolveDebugSource(
  tag: string,
  sourceOverride?: unknown,
): Promise<BookSource | null> {
  if (sourceOverride && typeof sourceOverride === 'object') {
    try {
      const edit = parseLegadoEditFromText(JSON.stringify(sourceOverride));
      return legadoEditToBookSource(edit);
    } catch {
      /* fall through */
    }
  }
  return sourcesDb.getSource(tag);
}

export async function runBookSourceDebugWebSocket(
  rawMessage: string,
  onSend: (text: string) => void | Promise<void>,
): Promise<void> {
  let payload: BookSourceDebugWsMessage;
  try {
    payload = JSON.parse(rawMessage) as BookSourceDebugWsMessage;
  } catch {
    await onSend('数据必须为Json格式');
    return;
  }

  const tag = payload.tag?.trim();
  const key = payload.key?.trim();
  if (!tag || !key) {
    await onSend('tag 与 key 不能为空');
    return;
  }

  const source = await resolveDebugSource(tag, payload.source);
  if (!source) {
    await onSend('未找到书源，请检查书源地址');
    return;
  }

  await startBookSourceDebug(source, key, async (state, message) => {
    if (NOT_PRINT_STATES.has(state)) return;
    await onSend(message);
    if (state === -1 || state === 1000) {
      cancelBookSourceDebug();
    }
  });
}

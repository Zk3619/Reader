/**
 * 订阅源调试 WebSocket（对齐 Legado RssSourceDebugWebSocket）
 */

import { parseRssSourceJson } from '@/lib/book-source/import-rss-source';
import * as rssDb from '@/lib/database/rss-sources';
import { startRssSourceDebug } from '@/lib/rss-source/rss-source-debug';
import type { RssSource } from '@/types';

export interface RssSourceDebugWsMessage {
  tag?: string;
  key?: string;
  source?: unknown;
}

const NOT_PRINT_STATES = new Set([10, 20, 30, 40]);

async function resolveDebugSource(
  tag: string,
  sourceOverride?: unknown,
): Promise<RssSource | null> {
  if (sourceOverride && typeof sourceOverride === 'object') {
    try {
      const text = JSON.stringify([sourceOverride]);
      return (parseRssSourceJson(text)[0] ?? null) as RssSource | null;
    } catch {
      /* fall through */
    }
  }
  return rssDb.getRssSource(tag);
}

export async function runRssSourceDebugWebSocket(
  rawMessage: string,
  onSend: (text: string) => void | Promise<void>,
): Promise<void> {
  let payload: RssSourceDebugWsMessage;
  try {
    payload = JSON.parse(rawMessage) as RssSourceDebugWsMessage;
  } catch {
    await onSend('数据必须为Json格式');
    return;
  }

  const tag = payload.tag?.trim();
  const key = payload.key?.trim() ?? '';
  if (!tag) {
    await onSend('tag 不能为空');
    return;
  }

  const source = await resolveDebugSource(tag, payload.source);
  if (!source) {
    await onSend('未找到订阅源，请检查源地址');
    return;
  }

  await startRssSourceDebug(source, key, async (state, message) => {
    if (NOT_PRINT_STATES.has(state)) return;
    await onSend(message);
  });
}

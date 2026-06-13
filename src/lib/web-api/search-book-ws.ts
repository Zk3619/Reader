/**
 * 在线搜书 WebSocket（对齐 Legado BookSearchWebSocket）
 */

import * as sourcesDb from '@/lib/database/sources';
import { MultiSourceSearchSession } from '@/lib/book-source/multi-source-search';

export interface SearchBookWsMessage {
  key?: string;
}

export async function runSearchBookWebSocket(
  rawMessage: string,
  onSend: (text: string) => void | Promise<void>,
): Promise<void> {
  let payload: SearchBookWsMessage;
  try {
    payload = JSON.parse(rawMessage) as SearchBookWsMessage;
  } catch {
    await onSend('数据必须为Json格式');
    return;
  }

  const key = payload.key?.trim();
  if (!key) {
    await onSend('关键字不能为空');
    return;
  }

  const sources = await sourcesDb.getAllSources();
  const session = new MultiSourceSearchSession();

  session.setCallbacks({
    onResults: async (books) => {
      await onSend(JSON.stringify(books));
    },
    onError: async (message) => {
      if (message) await onSend(message);
    },
  });

  await session.search(key, sources);
}

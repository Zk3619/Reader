import { decodeDataUrl, hexToUtf8 } from '@/lib/book-source/utils';

export interface OnlineVideoBrowserHints {
  itemId?: string;
  bookId?: string;
}

export function isOnlineVideoBrowserPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return /\/online_video$/i.test(path);
}

export function isOnlineVideoBrowserUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.startsWith('http')) return false;
  try {
    return isOnlineVideoBrowserPath(new URL(trimmed).pathname);
  } catch {
    return /\/online_video(?:\?|$)/i.test(trimmed);
  }
}

function readItemIdFromJsonLike(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const id = String((value as Record<string, unknown>).item_id ?? '').trim();
  return id;
}

function readItemIdFromText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    return readItemIdFromJsonLike(JSON.parse(trimmed) as unknown);
  } catch {
    /* ignore */
  }
  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length > 20) {
    try {
      return readItemIdFromJsonLike(JSON.parse(hexToUtf8(trimmed)) as unknown);
    } catch {
      /* ignore */
    }
  }
  return '';
}

/** 从规则脚本上下文推断 online_video 所需的 item_id */
export function resolveOnlineVideoBrowserHints(options: {
  variables?: Record<string, unknown>;
  chapter?: Record<string, unknown>;
  ruleContent?: string;
  initialResult?: unknown;
}): OnlineVideoBrowserHints {
  const variables = options.variables;
  const chapter = options.chapter;
  const fromVars = String(variables?.item_id ?? '').trim();
  if (fromVars) return { itemId: fromVars };

  const fromChapter = String(chapter?.item_id ?? '').trim();
  if (fromChapter) return { itemId: fromChapter };

  const chapterUrl = String(chapter?.url ?? '').trim();
  if (chapterUrl.startsWith('data:')) {
    const id = decodeDataUrl(chapterUrl)?.item_id?.trim();
    if (id) return { itemId: id };
  }

  const fromResultObject = readItemIdFromJsonLike(options.initialResult);
  if (fromResultObject) return { itemId: fromResultObject };

  if (typeof options.initialResult === 'string') {
    const fromResultText = readItemIdFromText(options.initialResult);
    if (fromResultText) return { itemId: fromResultText };
  }

  const ruleContent = String(options.ruleContent ?? '').trim();
  if (ruleContent.startsWith('data:')) {
    const id = decodeDataUrl(ruleContent)?.item_id?.trim();
    if (id) return { itemId: id };
  }
  const fromRuleContent = readItemIdFromText(ruleContent);
  if (fromRuleContent) return { itemId: fromRuleContent };

  return {};
}

/** 为光遇等 online_video 打开链接补上 item_id，避免页内二次跳转重复读进度 */
export function normalizeOnlineVideoBrowserUrl(
  url: string,
  hints?: OnlineVideoBrowserHints,
): string {
  const trimmed = url.trim();
  if (!isOnlineVideoBrowserUrl(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    const itemId = (hints?.itemId ?? u.searchParams.get('item_id') ?? '').trim();
    if (!itemId || u.searchParams.get('item_id')?.trim()) return trimmed;
    u.searchParams.set('item_id', itemId);
    return u.toString();
  } catch {
    return trimmed;
  }
}

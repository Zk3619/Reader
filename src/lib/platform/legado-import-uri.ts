/**
 * Legado / 阅读 深链接解析（对齐 Legado_Max OnLineImportActivity + determineType）。
 */

import { showAppToast } from '@/components/shared/AppToasts';

export const READER_BOOKSOURCE_IDENTIFY_EVENT = 'reader-booksource-identify';
export const READER_RSS_IMPORT_EVENT = 'reader-rss-import';
export const READER_REPLACE_RULE_IMPORT_EVENT = 'reader-replace-rule-import';

export type ReaderImportParsed =
  | { kind: 'bookSourceNetwork'; src: string }
  | { kind: 'rssNetwork'; src: string }
  | { kind: 'replaceRuleNetwork'; src: string }
  | { kind: 'txtTocRuleNetwork'; src: string }
  | { kind: 'determineType'; src: string }
  | { kind: 'unsupported'; reason: string };

function normalizeDecodedSrc(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep */
  }
  s = s.trim();
  if (!/^https:\/\//i.test(s) && !/^http:\/\//i.test(s)) return null;
  return s;
}

/** 解析 legado:// / yuedu:// 或裸 http(s) URL */
export function parseReaderImportDeepLink(uri: string): ReaderImportParsed | null {
  const raw = uri.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    return { kind: 'bookSourceNetwork', src: raw };
  }

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }

  const proto = u.protocol.replace(/:$/, '').toLowerCase();
  if (proto !== 'legado' && proto !== 'yuedu') return null;

  const src = normalizeDecodedSrc(u.searchParams.get('src') ?? '');
  if (!src) return null;

  const host = u.hostname.toLowerCase();
  const path = u.pathname.replace(/\\/g, '/');
  const pl = path.toLowerCase();

  if (host === 'import' && /^\/booksource\/?$/i.test(path)) {
    return { kind: 'bookSourceNetwork', src };
  }

  if (host === 'booksource' && pl.endsWith('/importonline')) {
    return { kind: 'bookSourceNetwork', src };
  }

  if (host === 'import') {
    if (/^\/rsssource\/?$/i.test(path)) {
      return { kind: 'rssNetwork', src };
    }
    if (/^\/replacerule\/?$/i.test(path)) {
      return { kind: 'replaceRuleNetwork', src };
    }
    if (/^\/texttocrule\/?$/i.test(path)) {
      return { kind: 'txtTocRuleNetwork', src };
    }
    if (
      /^\/(theme|dictrule|httptts|readconfig|addtobookshelf)\/?$/i.test(path)
    ) {
      return {
        kind: 'unsupported',
        reason:
          '当前 Reader 不支持通过链接导入该类型（主题、字典等）。完整备份请使用「设置 → 数据备份」恢复 .db 文件。',
      };
    }
    return { kind: 'determineType', src };
  }

  return { kind: 'determineType', src };
}

/** 处理一条深链接：触发识别或侧向导入流程 */
export async function handleReaderImportDeepLink(uri: string): Promise<void> {
  const parsed = parseReaderImportDeepLink(uri);
  if (!parsed) {
    showAppToast({ title: '导入链接无效', description: uri.slice(0, 120), variant: 'destructive' });
    return;
  }
  if (parsed.kind === 'unsupported') {
    showAppToast({
      title: '暂不支持',
      description: parsed.reason,
      variant: 'default',
    });
    return;
  }
  if (parsed.kind === 'rssNetwork') {
    window.dispatchEvent(
      new CustomEvent<{ url: string }>(READER_RSS_IMPORT_EVENT, { detail: { url: parsed.src } })
    );
    return;
  }
  if (parsed.kind === 'replaceRuleNetwork') {
    window.dispatchEvent(
      new CustomEvent<{ url: string }>(READER_REPLACE_RULE_IMPORT_EVENT, {
        detail: { url: parsed.src },
      })
    );
    return;
  }
  window.dispatchEvent(
    new CustomEvent<{ url: string }>(READER_BOOKSOURCE_IDENTIFY_EVENT, {
      detail: { url: parsed.src },
    })
  );
}

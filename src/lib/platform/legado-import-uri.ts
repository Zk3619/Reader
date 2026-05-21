/**
 * Legado / 阅读 深链接解析（对齐 Legado_Max OnLineImportActivity + determineType）。
 * Reader 当前仅支持书源 JSON（网络导入）；其它类型退回提示不支持。
 */

import { showAppToast } from '@/components/shared/AppToasts';
export const READER_BOOKSOURCE_IDENTIFY_EVENT = 'reader-booksource-identify';

export type ReaderImportParsed =
  | { kind: 'bookSourceNetwork'; src: string }
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

  // legado://import/bookSource?src=
  if (host === 'import' && /^\/booksource\/?$/i.test(path)) {
    return { kind: 'bookSourceNetwork', src };
  }

  // legado://booksource/importonline?src=  / yuedu://...
  if (host === 'booksource' && pl.endsWith('/importonline')) {
    return { kind: 'bookSourceNetwork', src };
  }

  if (host === 'import') {
    // Legado：`/rssSource`、`/replaceRule` 等与书源无关的导入
    if (
      /^\/(rsssource|replacerule|theme|texttocrule|dictrule|httptts|readconfig|addtobookshelf)\/?$/i.test(
        path
      )
    ) {
      return { kind: 'unsupported', reason: '当前 Reader 仅支持书源 JSON，暂不支持该类型的 legado:// 导入' };
    }
    return { kind: 'determineType', src };
  }

  return { kind: 'determineType', src };
}

/** 处理一条深链接：触发识别流程（供事件 / 命令行 / java.openUrl 调用） */
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
  window.dispatchEvent(
    new CustomEvent<{ url: string }>(READER_BOOKSOURCE_IDENTIFY_EVENT, {
      detail: { url: parsed.src },
    })
  );
}

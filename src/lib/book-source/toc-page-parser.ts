import type { BookChapter, BookSource, TocRule } from '@/types';

export type TocPageParserInput = {
  body: string;
  contentType: 'html' | 'text' | 'json';
  baseUrl: string;
  source: BookSource;
  rule: TocRule;
  listRule: string;
  initRule?: string;
  startIndex: number;
};

type WorkerResponse =
  | { id: number; ok: true; chapters: BookChapter[] }
  | { id: number; ok: false; error: string };

let requestId = 0;

const HOST_DEPENDENT_RULE =
  /java\.(?:ajax|connect|webView|startBrowser|cookie|put|setContent|toast|longToast)|cookie|localStorage|sessionStorage|window\.|document\.|fetch\s*\(|ajax\s*\(|toast\s*\(|startBrowser|webview|webjs/i;

/** 只有纯 CSS/XPath/JSONPath/Regex 规则才可完全移出 UI 线程。 */
export function canParseTocPageOffMainThread(rule: TocRule): boolean {
  const values = [
    rule.chapterList,
    rule.chapterName,
    rule.chapterUrl,
    rule.isVolume,
    rule.isVip,
    rule.isPay,
    rule.preUpdateJs,
    (rule as TocRule & { init?: string }).init,
  ];
  return values.every((value) => !value || !HOST_DEPENDENT_RULE.test(value));
}

/**
 * 对齐 Legado Dispatchers.IO：每页目录的列表提取和逐章规则解析运行在独立 Worker。
 * Worker 加载或执行失败时返回 null，由调用方兼容回退。
 * 即使规则含宿主调用也先在 Worker 尝试；可在 Worker 内完成的部分不应预先退回 UI 线程。
 */
export async function parseTocPageOffMainThread(
  input: TocPageParserInput,
  signal?: AbortSignal,
): Promise<BookChapter[] | null> {
  if (typeof Worker === 'undefined') {
    return null;
  }
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  const id = ++requestId;
  const worker = new Worker(
    new URL('./toc-page-parser.worker.ts', import.meta.url),
    { type: 'module', name: `toc-page-${id}` },
  );

  return new Promise<BookChapter[] | null>((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.ok) {
        resolve(event.data.chapters);
      } else {
        console.warn('[chapters] 目录解析 Worker 失败，回退主线程:', event.data.error);
        resolve(null);
      }
    };
    worker.onerror = (event) => {
      console.warn('[chapters] 目录解析 Worker 加载失败，回退主线程:', event.message);
      cleanup();
      resolve(null);
    };
    worker.postMessage({ id, ...input });
  });
}

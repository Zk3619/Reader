/**
 * 订阅模块「打开原文」：按设置走浏览器 / 内嵌自动 / iframe / WebView 面板
 */

import {
  peekSubscribeConfig,
  type SubscribeOpenOriginalMode,
} from '@/lib/persistence/domains/subscribe-config';
import { openUrlInApp, openUrlInBrowser } from '@/lib/platform/open-url';
import { openInnerWeb } from '@/lib/platform/inner-web';

export function resolveSubscribeEntryOpenUrl(
  rawUrl: string | null | undefined,
  baseUrl?: string | null,
): string {
  const raw = String(rawUrl ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(baseUrl ?? '').trim();
  if (!base) return raw;
  try {
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
}

export async function openSubscribeOriginal(
  url: string,
  options?: {
    title?: string;
    mode?: SubscribeOpenOriginalMode;
  },
): Promise<void> {
  const target = url.trim();
  if (!/^https?:\/\//i.test(target)) {
    throw new Error('链接不是有效的网页地址');
  }
  const mode = options?.mode ?? peekSubscribeConfig().openOriginalMode;
  const title = options?.title?.trim() || '原文';

  switch (mode) {
    case 'browser':
      await openUrlInBrowser(target);
      return;
    case 'iframe': {
      const ok = openInnerWeb({
        title,
        url: target,
        showConfirm: false,
        forceIframe: true,
      });
      if (!ok) throw new Error('内嵌页未就绪');
      return;
    }
    case 'webview': {
      const ok = openInnerWeb({
        title,
        url: target,
        showConfirm: false,
        forceTauriPanel: true,
      });
      if (!ok) throw new Error('内嵌页未就绪');
      return;
    }
    case 'inner-web':
    default:
      await openUrlInApp(target, title, { showConfirm: false });
      return;
  }
}

/**
 * 打开 RSS 源登录（与 RssSourceEditPage / App 共用）
 */

import type { BookSource, RssSource } from '@/types';
import { getStoredSourceCookiesForInnerWeb } from '@/lib/js-engine';
import { openSourceSettingsInApp } from '@/lib/platform/open-url';
import { showAppToast } from '@/components/shared/AppToasts';

export function rssSourceAsBookSource(source: RssSource): BookSource {
  return {
    ...source,
    bookSourceUrl: source.sourceUrl,
    sourceType: source.type ?? 0,
    enableExplore: false,
    respondTime: 0,
    weight: 0,
  } as unknown as BookSource;
}

/** 订阅源是否支持登录（对齐 legado RssAdapter：loginUrl 非空） */
export function rssSourceHasLogin(source: RssSource): boolean {
  return !!(source.loginUrl?.trim() || source.loginUi?.trim());
}

export async function openRssSourceLogin(
  source: RssSource,
  openDialog: (book: BookSource) => void,
): Promise<void> {
  const asBook = rssSourceAsBookSource(source);
  const url = source.loginUrl?.trim();
  const hasUi = !!source.loginUi?.trim();
  const isHttp = !!url && (url.startsWith('http://') || url.startsWith('https://'));

  if (isHttp && !hasUi) {
    try {
      const cookies = getStoredSourceCookiesForInnerWeb(asBook, url);
      await openSourceSettingsInApp(url, cookies, {
        bookSourceUrl: source.sourceUrl,
      });
    } catch (e) {
      console.error('打开订阅源登录页失败:', e);
      showAppToast({
        title: '打开失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
    return;
  }

  if (url || hasUi) {
    openDialog(asBook);
  } else {
    showAppToast({ title: '源未配置登录', variant: 'destructive' });
  }
}

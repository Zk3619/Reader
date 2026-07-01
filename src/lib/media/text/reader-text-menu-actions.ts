/**
 * 选区菜单动作（对齐 Legado TextActionMenu 基础操作）
 */

import { showAppToast } from '@/components/shared/AppToasts';
import { openUrlInBrowser } from '@/lib/platform/open-url';

export function isSelectionAbsoluteUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

export async function copySelectionText(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    await navigator.clipboard.writeText(trimmed);
    showAppToast({ title: '已复制' });
    return true;
  } catch {
    showAppToast({ title: '复制失败', variant: 'destructive' });
    return false;
  }
}

export async function openSelectionInBrowser(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (isSelectionAbsoluteUrl(trimmed)) {
    await openUrlInBrowser(trimmed);
    return;
  }
  await openUrlInBrowser(
    `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}`,
  );
}

export async function shareSelectionText(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text: trimmed });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  const copied = await copySelectionText(trimmed);
  if (copied) {
    showAppToast({ title: '已复制（当前环境不支持系统分享）' });
  }
}

export async function openProcessTextApp(urlTemplate: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const url = urlTemplate.replace('{text}', encodeURIComponent(trimmed));
  await openUrlInBrowser(url);
}

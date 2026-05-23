/**
 * 书源 JSON 网络导入（与 ImportSourceNetworkDialog 共用）
 */

import {
  importSelectedBookSources,
  resolveBookSourcesFromNetworkUrl,
} from '@/lib/book-source/import-booksource-resolver';
import { showAppToast } from '@/components/shared/AppToasts';
import { settingsStore } from '@/stores/settings';

export interface ImportBookSourcesNetworkResult {
  inserted: number;
}

/**
 * 从网络地址拉取并直接导入书源（不经过勾选对话框）；使用设置中的保留项。
 */
export async function importBookSourcesFromNetworkUrl(
  urlRaw: string
): Promise<ImportBookSourcesNetworkResult | { error: string }> {
  const url = urlRaw.trim();
  if (!url) {
    showAppToast({ title: '网络导入书源', description: '地址为空', variant: 'destructive' });
    return { error: 'empty' };
  }
  try {
    const { sources: list } = await resolveBookSourcesFromNetworkUrl(url);
    if (list.length === 0) {
      showAppToast({ title: '网络导入书源', description: '未解析到有效书源', variant: 'default' });
      return { error: 'none' };
    }
    const app = settingsStore.state.app;
    const { inserted, blocked } = await importSelectedBookSources(list, {
      keepName: app.importKeepName,
      keepGroup: app.importKeepGroup,
      keepEnable: app.importKeepEnable,
    });
    const blockedNote = blocked.length > 0 ? `，跳过 ${blocked.length} 条 18+ 书源` : '';
    showAppToast({
      title: '网络导入书源',
      description: `已导入 ${inserted} 条书源${blockedNote}`,
      variant: 'default',
    });
    return { inserted };
  } catch (err) {
    console.error('书源网络导入失败:', err);
    const isCorsOrNetwork =
      err instanceof TypeError &&
      (err.message === 'Failed to fetch' || err.message.includes('fetch'));
    const description = isCorsOrNetwork
      ? '该链接因跨域限制无法直接拉取。请下载书源 JSON 文件后使用「本地导入」。'
      : String(err);
    showAppToast({ title: '网络导入书源失败', description, variant: 'destructive' });
    return { error: description };
  }
}

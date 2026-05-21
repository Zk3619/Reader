/**
 * 书源 JSON 网络导入（与 ImportSourceNetworkDialog 共用）
 */

import { invoke } from '@tauri-apps/api/core';
import { parseBookSourceJson } from '@/lib/book-source/source-import';
import * as sourcesDb from '@/lib/database/sources';
import { showAppToast } from '@/components/shared/AppToasts';
import { isTauri } from '@/lib/platform/detect';

export interface ImportBookSourcesNetworkResult {
  inserted: number;
}

/**
 * 从网络地址拉取并导入书源；成功/失败均以 toast 提示。
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
    let text: string;
    if (isTauri()) {
      text = await invoke<string>('fetch_url_text', { url, timeoutMs: 30000 });
    } else {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`请求失败: ${res.status}`);
      text = await res.text();
    }
    const list = parseBookSourceJson(text);
    if (list.length === 0) {
      showAppToast({ title: '网络导入书源', description: '未解析到有效书源', variant: 'default' });
      return { error: 'none' };
    }
    for (const source of list) {
      await sourcesDb.insertSource(source);
    }
    window.dispatchEvent(new CustomEvent('sources-refresh'));
    showAppToast({ title: '网络导入书源', description: `已导入 ${list.length} 条书源`, variant: 'default' });
    return { inserted: list.length };
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

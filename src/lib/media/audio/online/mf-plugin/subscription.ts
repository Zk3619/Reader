/**
 * MusicFree 插件订阅源：持久 URL + 一键更新全部订阅
 */

import { importMfPluginFromUrl } from '@/lib/media/audio/online/mf-plugin';
import {
  addMfPluginSubscribeUrl,
  getMfGlobalSettings,
  removeMfPluginSubscribeUrl,
} from '@/lib/media/audio/online/mf-plugin/global-settings';

export async function updateAllMfPluginSubscriptions(): Promise<{
  ok: number;
  failed: number;
}> {
  const urls = getMfGlobalSettings().pluginSubscribeUrls;
  let ok = 0;
  let failed = 0;
  for (const url of urls) {
    try {
      const result = await importMfPluginFromUrl(url);
      if (result.ok) ok += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}

export { addMfPluginSubscribeUrl, removeMfPluginSubscribeUrl, getMfGlobalSettings };

/**
 * 订阅 OPML 文件下载（无列表方案：分类即精选合集的分享载体）
 */

import { exportSubscribeOpml } from '@/lib/subscribe/service';
import { subscribeOpmlExportSlug } from '@/lib/subscribe/opml';
import { downloadTextFile } from '@/lib/shared/download-source-scripts';

export async function downloadSubscribeOpmlFile(options?: {
  category?: string;
  sourceIds?: string[];
  title?: string;
}): Promise<void> {
  const xml = await exportSubscribeOpml(options);
  const slug =
    options?.sourceIds?.length && options.category === undefined
      ? `selected-${options.sourceIds.length}`
      : subscribeOpmlExportSlug(options?.category);
  await downloadTextFile(xml, `subscribe-${slug}-${Date.now()}.opml`, 'text/xml');
}

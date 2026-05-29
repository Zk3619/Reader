/**
 * 书源名称变更后，同步书架书籍与搜索缓存中的 originName（对齐 Legado 写入时带书源名、
 * BookInfoViewModel.refreshBook 在刷新详情时校正 originName 的行为）。
 */

import { getDatabase } from '@/lib/database/database-core';

export async function syncBooksOriginNameForSource(
  sourceUrl: string,
  sourceName: string
): Promise<void> {
  const trimmed = sourceName.trim();
  if (!sourceUrl.trim() || !trimmed) return;

  const db = await getDatabase();
  await db.execute(
    `UPDATE books SET originName = ?
     WHERE origin = ? AND origin NOT LIKE 'local%'`,
    [trimmed, sourceUrl]
  );
  await db.execute(`UPDATE searchBooks SET originName = ? WHERE origin = ?`, [
    trimmed,
    sourceUrl,
  ]);
}

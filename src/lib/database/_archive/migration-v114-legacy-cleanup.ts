/**
 * 数据库迁移 v114 — 清理双轨遗留：audio_playlists、chapter_cache、Max 空壳表
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import {
  dropTableIfExists,
  tableExists,
} from '@/lib/database/core/migration-helpers';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { mergeLegacyChapterCacheIntoReader } from '@/lib/database/migration-chapter-cache-v97';
import { AudioTables } from '@/lib/database/table-names';

export const LEGACY_CLEANUP_SCHEMA_VERSION = 114;

async function tableHasColumn(
  db: DatabaseAdapter,
  table: string,
  column: string,
): Promise<boolean> {
  if (!(await tableExists(db, table))) return false;
  const rows = await db.select<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

export async function migrateLegacyCleanupV114(db: DatabaseAdapter): Promise<void> {
  // audio_groups.description
  if (
    (await tableExists(db, AudioTables.groups)) &&
    !(await tableHasColumn(db, AudioTables.groups, 'description'))
  ) {
    await db.execute(
      `ALTER TABLE ${AudioTables.groups} ADD COLUMN description TEXT`,
    );
  }

  // 从 audio_playlists 补 cover / description 到 audio_groups
  if (await tableExists(db, 'audio_playlists')) {
    const hasCover = await tableHasColumn(db, 'audio_playlists', 'cover_url');
    const hasDesc = await tableHasColumn(db, 'audio_playlists', 'description');
    if (hasCover) {
      await db.execute(`
        UPDATE ${AudioTables.groups}
        SET cover = (
          SELECT p.cover_url FROM audio_playlists p
          WHERE p.id = ${AudioTables.groups}.listId
        )
        WHERE listId IS NOT NULL
          AND (cover IS NULL OR cover = '')
          AND EXISTS (
            SELECT 1 FROM audio_playlists p
            WHERE p.id = ${AudioTables.groups}.listId AND p.cover_url IS NOT NULL AND p.cover_url != ''
          )
      `);
    }
    if (hasDesc) {
      await db.execute(`
        UPDATE ${AudioTables.groups}
        SET description = (
          SELECT p.description FROM audio_playlists p
          WHERE p.id = ${AudioTables.groups}.listId
        )
        WHERE listId IS NOT NULL
          AND (description IS NULL OR description = '')
          AND EXISTS (
            SELECT 1 FROM audio_playlists p
            WHERE p.id = ${AudioTables.groups}.listId AND p.description IS NOT NULL AND p.description != ''
          )
      `);
    }
    await dropTableIfExists(db, 'audio_playlists');
  }

  // 孤儿 chapter_cache（可能缺 file_path）→ 安全合并后 DROP
  await mergeLegacyChapterCacheIntoReader(db);

  // Max 空壳表（FK：upload_histories → direct_link_upload_rules）
  await dropTableIfExists(db, 'upload_histories');
  await dropTableIfExists(db, 'direct_link_upload_rules');
  await dropTableIfExists(db, 'url_records');

  await setSchemaModuleVersion(db, 'audio', 5);
  await setSchemaModuleVersion(db, 'reader', 5);
  await setSchemaModuleVersion(db, 'core', 5);
}

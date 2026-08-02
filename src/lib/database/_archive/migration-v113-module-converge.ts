/**
 * 数据库迁移 v113 — M4：tv→video、playback/壳表改名，清理兼容 VIEW
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import {
  dropViewIfExists,
  renameTableIfExists,
  tableExists,
} from '@/lib/database/core/migration-helpers';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import {
  AudioTables,
  ReaderTables,
  ShellTables,
  VideoTables,
} from '@/lib/database/table-names';
import { READER_TABLE_RENAMES } from '@/lib/database/migration-v112-reader-prefix';

export const MODULE_CONVERGE_SCHEMA_VERSION = 113;

const VIDEO_RENAMES: Array<{ from: string; to: string }> = [
  { from: 'tv_config', to: VideoTables.configs },
  { from: 'tv_history', to: 'video_history' },
  { from: 'tv_keep', to: 'video_keep' },
  { from: 'tv_site_pref', to: VideoTables.sitePref },
];

const SHELL_RENAMES: Array<{ from: string; to: string }> = [
  { from: 'theme_presets', to: ShellTables.themePresets },
  { from: 'cookies', to: ShellTables.cookies },
  { from: 'caches', to: ShellTables.caches },
  { from: 'servers', to: ShellTables.servers },
];

export async function migrateModuleConvergeV113(db: DatabaseAdapter): Promise<void> {
  for (const { from, to } of VIDEO_RENAMES) {
    await renameTableIfExists(db, from, to);
  }

  await renameTableIfExists(db, 'music_playback_state', AudioTables.playbackState);

  for (const { from, to } of SHELL_RENAMES) {
    await renameTableIfExists(db, from, to);
  }

  // 确保 video_search_keywords 已存在（v111 已建；幂等）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${VideoTables.searchKeywords} (
      word TEXT NOT NULL PRIMARY KEY,
      usage INTEGER NOT NULL DEFAULT 1,
      lastUseTime INTEGER NOT NULL
    )
  `);

  // 删除阅读域兼容 VIEW（DAO 已切到 reader_*）
  for (const { from } of READER_TABLE_RENAMES) {
    await dropViewIfExists(db, from);
  }

  // 删除歌单过渡 VIEW
  await dropViewIfExists(db, 'audio_playlist_items');

  // 确认拆分组表仍在
  if (!(await tableExists(db, ReaderTables.bookGroups))) {
    throw new Error(`M4 期望表 ${ReaderTables.bookGroups} 不存在`);
  }
  if (!(await tableExists(db, AudioTables.groups))) {
    throw new Error(`M4 期望表 ${AudioTables.groups} 不存在`);
  }

  await setSchemaModuleVersion(db, 'video', 4);
  await setSchemaModuleVersion(db, 'shell', 4);
  await setSchemaModuleVersion(db, 'audio', 4);
  await setSchemaModuleVersion(db, 'core', 4);
}

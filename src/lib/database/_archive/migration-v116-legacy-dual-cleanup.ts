/**
 * 数据库迁移 v116 — 全面收敛无前缀 / 旧名双轨表
 *
 * 场景：v112 rename 在目标已存在时跳过，留下 books + reader_books 等双轨；
 * 或 v115 未跑完仍残留 video_history / video_keep。
 *
 * 注意：chapters/searchBooks 的 FOREIGN KEY 仍可能指向 books/book_sources。
 * 必须在 foreign_keys=OFF 下 DROP，并把子表 FK 重定向到 reader_*。
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import {
  copyTableIfDual,
  dropTableIfExists,
  dropViewIfExists,
  retargetTableForeignKeys,
  withForeignKeysDisabled,
} from '@/lib/database/core/migration-helpers';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import {
  AudioTables,
  ReaderTables,
  ShellTables,
  VideoTables,
} from '@/lib/database/table-names';
import { READER_TABLE_RENAMES } from '@/lib/database/migration-v112-reader-prefix';
import { migrateVideoGroupsV115 } from '@/lib/database/migration-v115-video-groups';

export const LEGACY_DUAL_CLEANUP_SCHEMA_VERSION = 116;

const SHELL_DUALS: Array<{ from: string; to: string }> = [
  { from: 'theme_presets', to: ShellTables.themePresets },
  { from: 'cookies', to: ShellTables.cookies },
  { from: 'caches', to: ShellTables.caches },
  { from: 'servers', to: ShellTables.servers },
];

const VIDEO_TV_DUALS: Array<{ from: string; to: string }> = [
  { from: 'tv_config', to: VideoTables.configs },
  { from: 'tv_site_pref', to: VideoTables.sitePref },
  { from: 'tv_history', to: 'video_history' },
  { from: 'tv_keep', to: 'video_keep' },
];

/** 先子后父，降低 FK ON 时的 DROP 风险（仍应在 FK OFF 下执行） */
const LEGACY_NAMES_TO_DROP: string[] = [
  // 子表 / 依赖表
  'chapters',
  'chapter_cache',
  'searchBooks',
  'bookmarks',
  'rssArticles',
  'rssStars',
  'rssReadRecords',
  'readRecordDetail',
  'readRecordSession',
  'readRecord',
  'search_keywords',
  'replace_rules',
  'httpTTS',
  'txtTocRules',
  'dictRules',
  'ruleSubs',
  'keyboardAssists',
  'rssSources',
  'book_sources',
  'books',
  // 壳无前缀
  'theme_presets',
  'cookies',
  'caches',
  'servers',
  // 音频旧名
  'music_playback_state',
  'audio_playlists',
  'audio_playlist_items',
  // 影视过渡 / 旧 tv
  'tv_config',
  'tv_history',
  'tv_keep',
  'tv_site_pref',
  'video_history',
  'video_keep',
  // 共享分组旧壳
  'media_group_items',
  'media_groups',
  'media_preview_items',
];

const FK_PARENT_MAP: Record<string, string> = {
  books: ReaderTables.books,
  book_sources: ReaderTables.bookSources,
};

export async function migrateLegacyDualCleanupV116(db: DatabaseAdapter): Promise<void> {
  const tAll = Date.now();
  console.log('[v116] ▶ 开始双轨清理');

  await withForeignKeysDisabled(db, async () => {
    console.log('[v116] ▶ 清理兼容 VIEW');
    for (const { from } of READER_TABLE_RENAMES) {
      await dropViewIfExists(db, from);
    }
    for (const { from } of SHELL_DUALS) {
      await dropViewIfExists(db, from);
    }
    await dropViewIfExists(db, 'music_playback_state');
    await dropViewIfExists(db, 'audio_playlist_items');

    console.log('[v116] ▶ 合并阅读无前缀表（大表可能较慢）');
    for (const { from, to } of READER_TABLE_RENAMES) {
      const t0 = Date.now();
      await copyTableIfDual(db, from, to);
      console.log(`[v116]   ${from} → ${to} (${Date.now() - t0}ms)`);
    }

    console.log('[v116] ▶ 合并壳表 / playback / tv_*');
    for (const { from, to } of SHELL_DUALS) {
      await copyTableIfDual(db, from, to);
    }
    await copyTableIfDual(db, 'music_playback_state', AudioTables.playbackState);
    for (const { from, to } of VIDEO_TV_DUALS) {
      await copyTableIfDual(db, from, to);
    }

    console.log('[v116] ▶ 重定向外键');
    await retargetTableForeignKeys(db, ReaderTables.chapters, FK_PARENT_MAP);
    await retargetTableForeignKeys(db, ReaderTables.searchBooks, FK_PARENT_MAP);
    await retargetTableForeignKeys(db, 'chapters', FK_PARENT_MAP);
    await retargetTableForeignKeys(db, 'searchBooks', FK_PARENT_MAP);

    console.log('[v116] ▶ 调用 v115 逻辑（幂等）');
    await migrateVideoGroupsV115(db);

    console.log('[v116] ▶ DROP 旧名');
    for (const name of LEGACY_NAMES_TO_DROP) {
      await dropViewIfExists(db, name);
      await dropTableIfExists(db, name);
    }
  });

  await setSchemaModuleVersion(db, 'reader', 7);
  await setSchemaModuleVersion(db, 'shell', 7);
  await setSchemaModuleVersion(db, 'audio', 7);
  await setSchemaModuleVersion(db, 'video', 7);
  await setSchemaModuleVersion(db, 'core', 7);
  console.log(`[v116] ✓ 完成 (${Date.now() - tAll}ms)`);
}

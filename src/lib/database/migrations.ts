/**
 * 数据库迁移定义
 * 对应 legado 项目的 DatabaseMigrations.kt
 * 
 * 注意：我们使用版本1作为初始版本，包含所有核心表结构
 * 后续可以根据需要添加更多迁移版本
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { LEGADO_SCHEMA_VERSION, migrateToLegadoV96 } from '@/lib/database/migration-v96';
import {
  CHAPTER_CACHE_SCHEMA_VERSION,
  migrateChapterCacheV97,
} from '@/lib/database/migration-chapter-cache-v97';
import {
  CHAPTER_CACHE_ENSURE_SCHEMA_VERSION,
  migrateChapterCacheV98,
} from '@/lib/database/migration-chapter-cache-v98';
import {
  CHAPTER_CACHE_TIER_SCHEMA_VERSION,
  migrateChapterCacheV99,
} from '@/lib/database/migration-chapter-cache-v99';
import {
  THEME_PRESETS_SCHEMA_VERSION,
  migrateThemePresetsV100,
} from '@/lib/database/migration-v100';
import {
  AUDIO_LIBRARY_SCHEMA_VERSION,
  migrateAudioLibraryV101,
} from '@/lib/database/migration-audio-v101';
import {
  AUDIO_DOWNLOAD_SCHEMA_VERSION,
  migrateAudioDownloadV102,
} from '@/lib/database/migration-audio-v102';
import {
  BOOK_TYPE_NORMALIZE_SCHEMA_VERSION,
  migrateBookTypeNormalizeV103,
} from '@/lib/database/migration-v103';
import {
  MEDIA_GROUPS_SCHEMA_VERSION,
  migrateMediaGroupsV104,
} from '@/lib/database/migration-v104-media-groups';
import {
  MEDIASBOX_SCHEMA_VERSION,
  migrateMediaboxV105,
} from '@/lib/database/migration-v105-mediabox';
import {
  MUSIC_LISTS_SCHEMA_VERSION,
  migrateMusicListsV106,
} from '@/lib/database/migration-v106-music-lists';
import {
  SCHEMA_MODULES_SCHEMA_VERSION,
  migrateSchemaModulesV110,
} from '@/lib/database/migration-v110-schema-modules';
import {
  MODULE_SPLIT_SCHEMA_VERSION,
  migrateModuleSplitV111,
} from '@/lib/database/migration-v111-module-split';
import {
  READER_PREFIX_SCHEMA_VERSION,
  migrateReaderPrefixV112,
} from '@/lib/database/migration-v112-reader-prefix';
import {
  MODULE_CONVERGE_SCHEMA_VERSION,
  migrateModuleConvergeV113,
} from '@/lib/database/migration-v113-module-converge';
import {
  LEGACY_CLEANUP_SCHEMA_VERSION,
  migrateLegacyCleanupV114,
} from '@/lib/database/migration-v114-legacy-cleanup';
import {
  VIDEO_GROUPS_SCHEMA_VERSION,
  migrateVideoGroupsV115,
} from '@/lib/database/migration-v115-video-groups';
import {
  LEGACY_DUAL_CLEANUP_SCHEMA_VERSION,
  migrateLegacyDualCleanupV116,
} from '@/lib/database/migration-v116-legacy-dual-cleanup';
import {
  VIDEO_SOURCES_SCHEMA_VERSION,
  migrateVideoSourcesV117,
} from '@/lib/database/migration-v117-video-sources';
import {
  MUSIC_CACHE_DOWNLOAD_SCHEMA_VERSION,
  migrateMusicCacheDownloadV118,
} from '@/lib/database/migration-v118-music-cache-download';
import {
  MUSIC_LYRIC_COVER_CACHE_SCHEMA_VERSION,
  migrateMusicLyricCoverCacheV119,
} from '@/lib/database/migration-v119-music-lyric-cover-cache';
import {
  VIDEO_PLAY_RECORD_SCHEMA_VERSION,
  migrateVideoPlayRecordV120,
} from '@/lib/database/migration-v120-video-play-record';
import {
  DOWNLOAD_META_SCHEMA_VERSION,
  migrateDownloadMetaV121,
} from '@/lib/database/migration-v121-download-meta';
import {
  MUSIC_PLAY_TRIAL_LISTS_SCHEMA_VERSION,
  migrateMusicPlayTrialListsV107,
} from '@/lib/database/migration-v107-music-play-trial-lists';
import {
  TV_MODULE_SCHEMA_VERSION,
  migrateTvModuleV108,
} from '@/lib/database/migration-v108-tv';
import {
  MUSIC_PLAYBACK_SCHEMA_VERSION,
  migrateMusicPlaybackV109,
} from '@/lib/database/migration-v109-music-playback';

export { LEGADO_SCHEMA_VERSION };
export { CHAPTER_CACHE_SCHEMA_VERSION };

export interface Migration {
  version: number;
  up: (db: DatabaseAdapter) => Promise<void>;
}

/**
 * 数据库迁移列表
 */
export const migrations: Migration[] = [
  {
    version: 1,
    up: async (db: DatabaseAdapter) => {
      // ========== 书籍相关表 ==========

      // 书籍表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS books (
          bookUrl TEXT NOT NULL DEFAULT '',
          tocUrl TEXT NOT NULL DEFAULT '',
          origin TEXT NOT NULL DEFAULT 'loc_book',
          originName TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL DEFAULT '',
          author TEXT NOT NULL DEFAULT '',
          kind TEXT,
          customTag TEXT,
          coverUrl TEXT,
          customCoverUrl TEXT,
          intro TEXT,
          customIntro TEXT,
          charset TEXT,
          type INTEGER NOT NULL DEFAULT 0,
          "group" INTEGER NOT NULL DEFAULT 0,
          latestChapterTitle TEXT,
          latestChapterTime INTEGER NOT NULL DEFAULT 0,
          lastCheckTime INTEGER NOT NULL DEFAULT 0,
          lastCheckCount INTEGER NOT NULL DEFAULT 0,
          totalChapterNum INTEGER NOT NULL DEFAULT 0,
          durChapterTitle TEXT,
          durChapterIndex INTEGER NOT NULL DEFAULT 0,
          durChapterPos INTEGER NOT NULL DEFAULT 0,
          durChapterTime INTEGER NOT NULL DEFAULT 0,
          wordCount TEXT,
          canUpdate INTEGER NOT NULL DEFAULT 1,
          "order" INTEGER NOT NULL DEFAULT 0,
          originOrder INTEGER NOT NULL DEFAULT 0,
          variable TEXT,
          readConfig TEXT,
          syncTime INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(bookUrl)
        )
      `);

      // 书籍分组表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS book_groups (
          groupId INTEGER NOT NULL,
          groupName TEXT NOT NULL,
          cover TEXT,
          "order" INTEGER NOT NULL,
          enableRefresh INTEGER NOT NULL DEFAULT 1,
          show INTEGER NOT NULL DEFAULT 1,
          bookSort INTEGER NOT NULL DEFAULT -1,
          PRIMARY KEY(groupId)
        )
      `);

      // 章节表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS chapters (
          url TEXT NOT NULL,
          title TEXT NOT NULL,
          isVolume INTEGER NOT NULL,
          baseUrl TEXT NOT NULL,
          bookUrl TEXT NOT NULL,
          "index" INTEGER NOT NULL,
          isVip INTEGER NOT NULL,
          isPay INTEGER NOT NULL,
          resourceUrl TEXT,
          tag TEXT,
          wordCount TEXT,
          start INTEGER,
          "end" INTEGER,
          startFragmentId TEXT,
          endFragmentId TEXT,
          variable TEXT,
          PRIMARY KEY(url, bookUrl),
          FOREIGN KEY(bookUrl) REFERENCES books(bookUrl) ON DELETE CASCADE
        )
      `);

      // 章节缓存表（用于存储章节内容）
      await db.execute(`
        CREATE TABLE IF NOT EXISTS chapter_cache (
          book_url TEXT NOT NULL,
          chapter_index INTEGER NOT NULL,
          content TEXT,
          file_path TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY(book_url, chapter_index)
        )
      `);

      // ========== 书源相关表 ==========

      // 书源表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS book_sources (
          bookSourceUrl TEXT NOT NULL,
          bookSourceName TEXT NOT NULL,
          bookSourceGroup TEXT,
          bookSourceType INTEGER NOT NULL,
          bookUrlPattern TEXT,
          customOrder INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1,
          enabledExplore INTEGER NOT NULL DEFAULT 1,
          jsLib TEXT,
          enabledCookieJar INTEGER DEFAULT 0,
          concurrentRate TEXT,
          header TEXT,
          loginUrl TEXT,
          loginUi TEXT,
          loginCheckJs TEXT,
          coverDecodeJs TEXT,
          bookSourceComment TEXT,
          variableComment TEXT,
          lastUpdateTime INTEGER NOT NULL,
          respondTime INTEGER NOT NULL,
          weight INTEGER NOT NULL,
          exploreUrl TEXT,
          exploreScreen TEXT,
          ruleExplore TEXT,
          searchUrl TEXT,
          ruleSearch TEXT,
          ruleBookInfo TEXT,
          ruleToc TEXT,
          ruleContent TEXT,
          ruleReview TEXT,
          PRIMARY KEY(bookSourceUrl)
        )
      `);

      // ========== 搜索相关表 ==========

      // 搜索结果表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS searchBooks (
          bookUrl TEXT NOT NULL,
          origin TEXT NOT NULL,
          originName TEXT NOT NULL,
          type INTEGER NOT NULL,
          name TEXT NOT NULL,
          author TEXT NOT NULL,
          kind TEXT,
          coverUrl TEXT,
          intro TEXT,
          wordCount TEXT,
          latestChapterTitle TEXT,
          tocUrl TEXT NOT NULL,
          time INTEGER NOT NULL,
          variable TEXT,
          originOrder INTEGER NOT NULL,
          chapterWordCountText TEXT,
          chapterWordCount INTEGER NOT NULL DEFAULT -1,
          respondTime INTEGER NOT NULL DEFAULT -1,
          PRIMARY KEY(bookUrl),
          FOREIGN KEY(origin) REFERENCES book_sources(bookSourceUrl) ON DELETE CASCADE
        )
      `);

      // 搜索关键词表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS search_keywords (
          word TEXT NOT NULL,
          usage INTEGER NOT NULL,
          lastUseTime INTEGER NOT NULL,
          PRIMARY KEY(word)
        )
      `);

      // ========== 替换规则表 ==========

      await db.execute(`
        CREATE TABLE IF NOT EXISTS replace_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          "group" TEXT,
          pattern TEXT NOT NULL DEFAULT '',
          replacement TEXT NOT NULL DEFAULT '',
          scope TEXT,
          scopeTitle INTEGER NOT NULL DEFAULT 0,
          scopeContent INTEGER NOT NULL DEFAULT 1,
          excludeScope TEXT,
          isEnabled INTEGER NOT NULL DEFAULT 1,
          isRegex INTEGER NOT NULL DEFAULT 1,
          timeoutMillisecond INTEGER NOT NULL DEFAULT 3000,
          sortOrder INTEGER NOT NULL DEFAULT 0
        )
      `);

      // ========== RSS订阅相关表 ==========

      // RSS源表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS rssSources (
          sourceUrl TEXT NOT NULL,
          sourceName TEXT NOT NULL,
          sourceIcon TEXT NOT NULL,
          sourceGroup TEXT,
          sourceComment TEXT,
          enabled INTEGER NOT NULL,
          variableComment TEXT,
          jsLib TEXT,
          enabledCookieJar INTEGER DEFAULT 0,
          concurrentRate TEXT,
          header TEXT,
          loginUrl TEXT,
          loginUi TEXT,
          loginCheckJs TEXT,
          coverDecodeJs TEXT,
          sortUrl TEXT,
          singleUrl INTEGER NOT NULL,
          articleStyle INTEGER NOT NULL DEFAULT 0,
          ruleArticles TEXT,
          ruleNextPage TEXT,
          ruleTitle TEXT,
          rulePubDate TEXT,
          ruleDescription TEXT,
          ruleImage TEXT,
          ruleLink TEXT,
          ruleContent TEXT,
          contentWhitelist TEXT,
          contentBlacklist TEXT,
          shouldOverrideUrlLoading TEXT,
          style TEXT,
          enableJs INTEGER NOT NULL DEFAULT 1,
          loadWithBaseUrl INTEGER NOT NULL DEFAULT 1,
          injectJs TEXT,
          lastUpdateTime INTEGER NOT NULL DEFAULT 0,
          customOrder INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(sourceUrl)
        )
      `);

      // RSS文章表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS rssArticles (
          origin TEXT NOT NULL,
          sort TEXT NOT NULL,
          title TEXT NOT NULL,
          "order" INTEGER NOT NULL,
          link TEXT NOT NULL,
          pubDate TEXT,
          description TEXT,
          content TEXT,
          image TEXT,
          "group" TEXT NOT NULL DEFAULT '默认分组',
          read INTEGER NOT NULL,
          variable TEXT,
          PRIMARY KEY(origin, link)
        )
      `);

      // RSS收藏表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS rssStars (
          origin TEXT NOT NULL,
          sort TEXT NOT NULL,
          title TEXT NOT NULL,
          starTime INTEGER NOT NULL,
          link TEXT NOT NULL,
          pubDate TEXT,
          description TEXT,
          content TEXT,
          image TEXT,
          "group" TEXT NOT NULL DEFAULT '默认分组',
          variable TEXT,
          PRIMARY KEY(origin, link)
        )
      `);

      // RSS阅读记录表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS rssReadRecords (
          record TEXT NOT NULL,
          title TEXT,
          readTime INTEGER,
          read INTEGER NOT NULL,
          PRIMARY KEY(record)
        )
      `);

      // ========== 其他表 ==========

      // 书签表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS bookmarks (
          time INTEGER NOT NULL,
          bookName TEXT NOT NULL,
          bookAuthor TEXT NOT NULL,
          chapterIndex INTEGER NOT NULL,
          chapterPos INTEGER NOT NULL,
          chapterName TEXT NOT NULL,
          bookText TEXT NOT NULL,
          content TEXT NOT NULL,
          PRIMARY KEY(time)
        )
      `);

      // 阅读记录表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS readRecord (
          deviceId TEXT NOT NULL,
          bookName TEXT NOT NULL,
          readTime INTEGER NOT NULL DEFAULT 0,
          lastRead INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(deviceId, bookName)
        )
      `);

      // Cookie表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS cookies (
          url TEXT NOT NULL,
          cookie TEXT NOT NULL,
          PRIMARY KEY(url)
        )
      `);

      // 缓存表
      await db.execute(`
        CREATE TABLE IF NOT EXISTS caches (
          key TEXT NOT NULL,
          value TEXT,
          deadline INTEGER NOT NULL,
          PRIMARY KEY(key)
        )
      `);

      // ========== 索引 ==========

      // 书籍表索引
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_books_name_author 
        ON books(name, author)
      `);

      // 章节表索引
      await db.execute(`
        CREATE INDEX IF NOT EXISTS index_chapters_bookUrl 
        ON chapters(bookUrl)
      `);

      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_chapters_bookUrl_index 
        ON chapters(bookUrl, "index")
      `);

      // 书源表索引
      await db.execute(`
        CREATE INDEX IF NOT EXISTS index_book_sources_bookSourceUrl 
        ON book_sources(bookSourceUrl)
      `);

      // 搜索结果表索引
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_searchBooks_bookUrl 
        ON searchBooks(bookUrl)
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS index_searchBooks_origin 
        ON searchBooks(origin)
      `);

      // 搜索关键词表索引
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_search_keywords_word 
        ON search_keywords(word)
      `);

      // 书签表索引
      await db.execute(`
        CREATE INDEX IF NOT EXISTS index_bookmarks_bookName_bookAuthor 
        ON bookmarks(bookName, bookAuthor)
      `);

      // RSS源表索引
      await db.execute(`
        CREATE INDEX IF NOT EXISTS index_rssSources_sourceUrl 
        ON rssSources(sourceUrl)
      `);

      // 缓存表索引
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_caches_key 
        ON caches(key)
      `);

      // Cookie表索引
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_cookies_url 
        ON cookies(url)
      `);

      // 替换规则表索引
      await db.execute(`
        CREATE INDEX IF NOT EXISTS index_replace_rules_id 
        ON replace_rules(id)
      `);
    },
  },
  {
    version: LEGADO_SCHEMA_VERSION,
    up: migrateToLegadoV96,
  },
  {
    version: CHAPTER_CACHE_SCHEMA_VERSION,
    up: migrateChapterCacheV97,
  },
  {
    version: CHAPTER_CACHE_ENSURE_SCHEMA_VERSION,
    up: migrateChapterCacheV98,
  },
  {
    version: CHAPTER_CACHE_TIER_SCHEMA_VERSION,
    up: migrateChapterCacheV99,
  },
  {
    version: THEME_PRESETS_SCHEMA_VERSION,
    up: migrateThemePresetsV100,
  },
  {
    version: AUDIO_LIBRARY_SCHEMA_VERSION,
    up: migrateAudioLibraryV101,
  },
  {
    version: AUDIO_DOWNLOAD_SCHEMA_VERSION,
    up: migrateAudioDownloadV102,
  },
  {
    version: BOOK_TYPE_NORMALIZE_SCHEMA_VERSION,
    up: migrateBookTypeNormalizeV103,
  },
  {
    version: MEDIA_GROUPS_SCHEMA_VERSION,
    up: migrateMediaGroupsV104,
  },
  {
    version: MEDIASBOX_SCHEMA_VERSION,
    up: migrateMediaboxV105,
  },
  {
    version: MUSIC_LISTS_SCHEMA_VERSION,
    up: migrateMusicListsV106,
  },
  {
    version: MUSIC_PLAY_TRIAL_LISTS_SCHEMA_VERSION,
    up: migrateMusicPlayTrialListsV107,
  },
  {
    version: TV_MODULE_SCHEMA_VERSION,
    up: migrateTvModuleV108,
  },
  {
    version: MUSIC_PLAYBACK_SCHEMA_VERSION,
    up: migrateMusicPlaybackV109,
  },
  {
    version: SCHEMA_MODULES_SCHEMA_VERSION,
    up: migrateSchemaModulesV110,
  },
  {
    version: MODULE_SPLIT_SCHEMA_VERSION,
    up: migrateModuleSplitV111,
  },
  {
    version: READER_PREFIX_SCHEMA_VERSION,
    up: migrateReaderPrefixV112,
  },
  {
    version: MODULE_CONVERGE_SCHEMA_VERSION,
    up: migrateModuleConvergeV113,
  },
  {
    version: LEGACY_CLEANUP_SCHEMA_VERSION,
    up: migrateLegacyCleanupV114,
  },
  {
    version: VIDEO_GROUPS_SCHEMA_VERSION,
    up: migrateVideoGroupsV115,
  },
  {
    version: LEGACY_DUAL_CLEANUP_SCHEMA_VERSION,
    up: migrateLegacyDualCleanupV116,
  },
  {
    version: VIDEO_SOURCES_SCHEMA_VERSION,
    up: migrateVideoSourcesV117,
  },
  {
    version: MUSIC_CACHE_DOWNLOAD_SCHEMA_VERSION,
    up: migrateMusicCacheDownloadV118,
  },
  {
    version: MUSIC_LYRIC_COVER_CACHE_SCHEMA_VERSION,
    up: migrateMusicLyricCoverCacheV119,
  },
  {
    version: VIDEO_PLAY_RECORD_SCHEMA_VERSION,
    up: migrateVideoPlayRecordV120,
  },
  {
    version: DOWNLOAD_META_SCHEMA_VERSION,
    up: migrateDownloadMetaV121,
  },
];

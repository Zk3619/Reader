/**
 * Legado Max AppDatabase v96  schema 对齐迁移
 * 以 Legado_Max-main/app/schemas/io.legado.app.data.AppDatabase/96.json 为准
 */

import type { DatabaseAdapter } from '@/lib/platform/database';

export const LEGADO_SCHEMA_VERSION = 96;

async function tableExists(db: DatabaseAdapter, table: string): Promise<boolean> {
  const rows = await db.select<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    [table]
  );
  return rows.length > 0;
}

async function tableHasColumn(
  db: DatabaseAdapter,
  table: string,
  column: string
): Promise<boolean> {
  if (!(await tableExists(db, table))) return false;
  const rows = await db.select<{ name: string }>(
    `PRAGMA table_info(${table})`
  );
  return rows.some((r) => r.name === column);
}

async function addColumnIfMissing(
  db: DatabaseAdapter,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  if (!(await tableHasColumn(db, table, column))) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function migrateReadRecord(db: DatabaseAdapter): Promise<void> {
  if (!(await tableExists(db, 'readRecord'))) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS readRecord (
        deviceId TEXT NOT NULL,
        bookName TEXT NOT NULL,
        bookAuthor TEXT NOT NULL DEFAULT '',
        readTime INTEGER NOT NULL DEFAULT 0,
        lastRead INTEGER NOT NULL DEFAULT 0,
        durChapterTitle TEXT NOT NULL DEFAULT '',
        durChapterIndex INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(deviceId, bookName, bookAuthor)
      )
    `);
    return;
  }
  if (await tableHasColumn(db, 'readRecord', 'bookAuthor')) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS readRecord_new (
      deviceId TEXT NOT NULL,
      bookName TEXT NOT NULL,
      bookAuthor TEXT NOT NULL DEFAULT '',
      readTime INTEGER NOT NULL DEFAULT 0,
      lastRead INTEGER NOT NULL DEFAULT 0,
      durChapterTitle TEXT NOT NULL DEFAULT '',
      durChapterIndex INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(deviceId, bookName, bookAuthor)
    )
  `);
  await db.execute(`
    INSERT INTO readRecord_new (deviceId, bookName, bookAuthor, readTime, lastRead, durChapterTitle, durChapterIndex)
    SELECT deviceId, bookName, '', readTime, lastRead, '', 0 FROM readRecord
  `);
  await db.execute('DROP TABLE readRecord');
  await db.execute('ALTER TABLE readRecord_new RENAME TO readRecord');
}

async function migrateRssArticles(db: DatabaseAdapter): Promise<void> {
  if (!(await tableExists(db, 'rssArticles'))) {
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
        type INTEGER NOT NULL DEFAULT 0,
        durPos INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(origin, link, sort)
      )
    `);
    return;
  }
  if (await tableHasColumn(db, 'rssArticles', 'type')) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS rssArticles_new (
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
      type INTEGER NOT NULL DEFAULT 0,
      durPos INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(origin, link, sort)
    )
  `);
  await db.execute(`
    INSERT INTO rssArticles_new (
      origin, sort, title, "order", link, pubDate, description, content, image,
      "group", read, variable, type, durPos
    )
    SELECT
      origin, sort, title, "order", link, pubDate, description, content, image,
      "group", read, variable, 0, 0
    FROM rssArticles
  `);
  await db.execute('DROP TABLE rssArticles');
  await db.execute('ALTER TABLE rssArticles_new RENAME TO rssArticles');
}

async function migrateBookSources(db: DatabaseAdapter): Promise<void> {
  if (!(await tableExists(db, 'book_sources'))) return;

  const hasNextPagePreload = await tableHasColumn(db, 'book_sources', 'nextPagePreload');
  const hasNextPageLazyLoad = await tableHasColumn(db, 'book_sources', 'nextPageLazyLoad');

  if (hasNextPagePreload && !hasNextPageLazyLoad) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS book_sources_new (
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
        eventListener INTEGER NOT NULL DEFAULT 0,
        customButton INTEGER NOT NULL DEFAULT 0,
        nextPageLazyLoad INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(bookSourceUrl)
      )
    `);
    await db.execute(`
      INSERT INTO book_sources_new SELECT
        bookSourceUrl, bookSourceName, bookSourceGroup, bookSourceType, bookUrlPattern,
        customOrder, enabled, enabledExplore, jsLib, enabledCookieJar, concurrentRate,
        header, loginUrl, loginUi, loginCheckJs, coverDecodeJs, bookSourceComment,
        variableComment, lastUpdateTime, respondTime, weight, exploreUrl, exploreScreen,
        ruleExplore, searchUrl, ruleSearch, ruleBookInfo, ruleToc, ruleContent, ruleReview,
        COALESCE(eventListener, 0), COALESCE(customButton, 0), COALESCE(nextPagePreload, 0)
      FROM book_sources
    `);
    await db.execute('DROP TABLE book_sources');
    await db.execute('ALTER TABLE book_sources_new RENAME TO book_sources');
    await db.execute(`
      CREATE INDEX IF NOT EXISTS index_book_sources_bookSourceUrl
      ON book_sources(bookSourceUrl)
    `);
    return;
  }

  await addColumnIfMissing(db, 'book_sources', 'eventListener', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'book_sources', 'customButton', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'book_sources', 'nextPageLazyLoad', 'INTEGER NOT NULL DEFAULT 0');
}

async function createNewTables(db: DatabaseAdapter): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS txtTocRules (
      id INTEGER NOT NULL,
      name TEXT NOT NULL,
      rule TEXT NOT NULL,
      replacement TEXT NOT NULL DEFAULT '',
      example TEXT,
      serialNumber INTEGER NOT NULL,
      enable INTEGER NOT NULL,
      PRIMARY KEY(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS readRecordDetail (
      deviceId TEXT NOT NULL,
      bookName TEXT NOT NULL,
      bookAuthor TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      readTime INTEGER NOT NULL DEFAULT 0,
      readWords INTEGER NOT NULL DEFAULT 0,
      firstReadTime INTEGER NOT NULL DEFAULT 0,
      lastReadTime INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(deviceId, bookName, bookAuthor, date)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS readRecordSession (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      deviceId TEXT NOT NULL,
      bookName TEXT NOT NULL,
      bookAuthor TEXT NOT NULL DEFAULT '',
      startTime INTEGER NOT NULL,
      endTime INTEGER NOT NULL,
      words INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS httpTTS (
      id INTEGER NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      contentType TEXT,
      concurrentRate TEXT DEFAULT '0',
      loginUrl TEXT,
      loginUi TEXT,
      header TEXT,
      jsLib TEXT,
      enabledCookieJar INTEGER DEFAULT 0,
      loginCheckJs TEXT,
      lastUpdateTime INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ruleSubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type INTEGER NOT NULL,
      customOrder INTEGER NOT NULL,
      autoUpdate INTEGER NOT NULL,
      "update" INTEGER NOT NULL,
      updateInterval INTEGER NOT NULL DEFAULT 0,
      silentUpdate INTEGER NOT NULL DEFAULT 0,
      js TEXT,
      showRule TEXT,
      sourceUrl TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS dictRules (
      name TEXT NOT NULL,
      urlRule TEXT NOT NULL,
      showRule TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sortNumber INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(name)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS keyboardAssists (
      type INTEGER NOT NULL DEFAULT 0,
      key TEXT NOT NULL DEFAULT '',
      value TEXT NOT NULL DEFAULT '',
      serialNo INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(type, key)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT,
      sortNumber INTEGER NOT NULL,
      PRIMARY KEY(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS url_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      url TEXT NOT NULL,
      domain TEXT NOT NULL,
      method TEXT NOT NULL,
      sourceName TEXT,
      sourceUrl TEXT,
      timestamp INTEGER NOT NULL,
      responseCode INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      requestBody TEXT,
      errorMsg TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS direct_link_upload_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      uploadUrl TEXT NOT NULL,
      downloadUrlRule TEXT NOT NULL,
      summary TEXT NOT NULL,
      compress INTEGER NOT NULL,
      customHeaders TEXT,
      timeout INTEGER NOT NULL,
      retryCount INTEGER NOT NULL,
      sortOrder INTEGER NOT NULL,
      isDefault INTEGER NOT NULL,
      uploadCount INTEGER NOT NULL,
      lastUsedTime INTEGER NOT NULL,
      createTime INTEGER NOT NULL,
      updateTime INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS upload_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      fileName TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      contentType TEXT NOT NULL,
      uploadTime INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      downloadUrl TEXT NOT NULL,
      expireTime INTEGER,
      ruleId INTEGER NOT NULL,
      ruleSummary TEXT NOT NULL,
      success INTEGER NOT NULL,
      errorMsg TEXT,
      FOREIGN KEY(ruleId) REFERENCES direct_link_upload_rules(id) ON DELETE CASCADE
    )
  `);
}

async function createIndexesAndView(db: DatabaseAdapter): Promise<void> {
  await db.execute(`
    CREATE INDEX IF NOT EXISTS index_url_records_timestamp ON url_records(timestamp)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS index_url_records_domain ON url_records(domain)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS index_direct_link_upload_rules_sortOrder
    ON direct_link_upload_rules(sortOrder)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS index_direct_link_upload_rules_isDefault
    ON direct_link_upload_rules(isDefault)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS index_upload_histories_uploadTime ON upload_histories(uploadTime)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS index_upload_histories_ruleId ON upload_histories(ruleId)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS index_upload_histories_success ON upload_histories(success)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS index_rssReadRecords_origin ON rssReadRecords(origin)
  `);

  await db.execute('DROP VIEW IF EXISTS BookSourcePart');
  await db.execute(`
    CREATE VIEW BookSourcePart AS
    SELECT bookSourceUrl, bookSourceName, bookSourceGroup, customOrder, enabled, enabledExplore,
      (loginUrl IS NOT NULL AND trim(loginUrl) <> '') AS hasLoginUrl,
      lastUpdateTime, respondTime, weight,
      (exploreUrl IS NOT NULL AND trim(exploreUrl) <> '') AS hasExploreUrl,
      eventListener, bookSourceType
    FROM book_sources
  `);
}

/**
 * 幂等迁移至 Legado v96 schema
 */
export async function migrateToLegadoV96(db: DatabaseAdapter): Promise<void> {
  await addColumnIfMissing(db, 'books', 'durVolumeIndex', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'books', 'chapterInVolumeIndex', 'INTEGER NOT NULL DEFAULT 0');

  await addColumnIfMissing(db, 'book_groups', 'onlyUpdateRead', 'INTEGER NOT NULL DEFAULT 0');

  await migrateBookSources(db);

  await addColumnIfMissing(db, 'chapters', 'imgUrl', 'TEXT');

  await addColumnIfMissing(db, 'rssSources', 'preloadJs', 'TEXT');
  await addColumnIfMissing(db, 'rssSources', 'startHtml', 'TEXT');
  await addColumnIfMissing(db, 'rssSources', 'startStyle', 'TEXT');
  await addColumnIfMissing(db, 'rssSources', 'startJs', 'TEXT');
  await addColumnIfMissing(db, 'rssSources', 'showWebLog', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'rssSources', 'type', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'rssSources', 'preload', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'rssSources', 'cacheFirst', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'rssSources', 'searchUrl', 'TEXT');

  await migrateRssArticles(db);

  await addColumnIfMissing(db, 'rssStars', 'type', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'rssStars', 'durPos', 'INTEGER NOT NULL DEFAULT 0');

  await addColumnIfMissing(db, 'rssReadRecords', 'origin', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'rssReadRecords', 'sort', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'rssReadRecords', 'image', 'TEXT');
  await addColumnIfMissing(db, 'rssReadRecords', 'type', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'rssReadRecords', 'durPos', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'rssReadRecords', 'pubDate', 'TEXT');

  await migrateReadRecord(db);

  await createNewTables(db);
  await createIndexesAndView(db);
}

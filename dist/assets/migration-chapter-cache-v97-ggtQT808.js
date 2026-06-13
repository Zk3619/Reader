const h=97;async function t(e){if((await e.select("SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_cache'")).length===0){await e.execute(`
      CREATE TABLE IF NOT EXISTS chapter_cache (
        book_url TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        content TEXT,
        file_path TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY(book_url, chapter_index)
      )
    `);return}(await e.select("PRAGMA table_info(chapter_cache)")).map(a=>String(a.name??"").toLowerCase()).includes("file_path")||(console.log("[数据库迁移] chapter_cache 添加 file_path 列"),await e.execute("ALTER TABLE chapter_cache ADD COLUMN file_path TEXT"))}async function s(e){await t(e)}export{h as CHAPTER_CACHE_SCHEMA_VERSION,t as ensureChapterCacheSchema,s as migrateChapterCacheV97};

import{t as r,R as i,d as _,a as l}from"./index-B_P04-aJ.js";const f=97;async function o(e,t){const a=await e.select(`PRAGMA table_info(${t})`);return new Set(a.map(c=>String(c.name??"").toLowerCase()))}async function L(e){if(await _(e,"chapter_cache"),!await r(e,"chapter_cache"))return;const t=i.chapterCache;await r(e,t)||await e.execute(`
      CREATE TABLE IF NOT EXISTS ${t} (
        book_url TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        content TEXT,
        file_path TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        cache_tier TEXT NOT NULL DEFAULT 'auto',
        PRIMARY KEY(book_url, chapter_index)
      )
    `);const a=await o(e,"chapter_cache"),c=a.has("file_path"),T=a.has("cache_tier"),n=a.has("created_at"),s=c?"file_path":"NULL",h=T?"cache_tier":"'auto'",E=n?"created_at":"strftime('%s', 'now')";await e.execute(`
    INSERT OR IGNORE INTO ${t}
      (book_url, chapter_index, content, file_path, created_at, cache_tier)
    SELECT book_url, chapter_index, content, ${s}, ${E}, ${h}
    FROM chapter_cache
  `),await l(e,"chapter_cache")}async function p(e){const t=i.chapterCache;if(await L(e),!await r(e,t)){await e.execute(`
      CREATE TABLE IF NOT EXISTS ${t} (
        book_url TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        content TEXT,
        file_path TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        cache_tier TEXT NOT NULL DEFAULT 'auto',
        PRIMARY KEY(book_url, chapter_index)
      )
    `);return}const a=await o(e,t);a.has("file_path")||(console.log(`[数据库迁移] ${t} 添加 file_path 列`),await e.execute(`ALTER TABLE ${t} ADD COLUMN file_path TEXT`)),a.has("cache_tier")||(console.log(`[数据库迁移] ${t} 添加 cache_tier 列`),await e.execute(`ALTER TABLE ${t} ADD COLUMN cache_tier TEXT NOT NULL DEFAULT 'auto'`))}async function u(e){await p(e)}export{f as CHAPTER_CACHE_SCHEMA_VERSION,p as ensureChapterCacheSchema,L as mergeLegacyChapterCacheIntoReader,u as migrateChapterCacheV97};

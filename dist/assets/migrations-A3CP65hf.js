import{t as L,R as o,bx as r,by as v,A as i,bz as O,V as T,S,d as p,a as l,bA as C,bB as q,bC as G,bD as A,bE as w,bF as z,bG as Z,bH as b,bI as ee}from"./index-B74fRilb.js";import{ensureChapterCacheSchema as K,mergeLegacyChapterCacheIntoReader as te,migrateChapterCacheV97 as ae,CHAPTER_CACHE_SCHEMA_VERSION as Te}from"./migration-chapter-cache-v97-mAI7VsLJ.js";const Ee=98;async function oe(e){await K(e)}const ie=99;async function re(e){await K(e);const t=await L(e,o.chapterCache)?o.chapterCache:"chapter_cache";if(!await L(e,t))return;(await e.select(`PRAGMA table_info(${t})`)).map(N=>String(N.name??"").toLowerCase()).includes("cache_tier")||(console.log(`[数据库迁移] ${t} 添加 cache_tier 列`),await e.execute(`ALTER TABLE ${t} ADD COLUMN cache_tier TEXT NOT NULL DEFAULT 'auto'`))}const se=100;async function Ne(e){await e.execute(`
    CREATE TABLE IF NOT EXISTS theme_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'user',
      scopes_app INTEGER NOT NULL DEFAULT 1,
      scopes_viewer INTEGER NOT NULL DEFAULT 1,
      manifest_json TEXT NOT NULL,
      thumbnail_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS index_theme_presets_kind
    ON theme_presets(kind)
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS index_theme_presets_updated
    ON theme_presets(updated_at DESC)
  `)}const Le=101;async function ce(e){await e.execute(`
    CREATE TABLE IF NOT EXISTS audio_tracks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'local',
      duration TEXT NOT NULL DEFAULT '00:00',
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS audio_playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'builtin',
      description TEXT,
      cover_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS audio_playlist_items (
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (playlist_id, track_id)
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS audio_url_cache (
      track_id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS audio_auth_sessions (
      platform TEXT PRIMARY KEY,
      cookies TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      healthy INTEGER NOT NULL DEFAULT 0
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS audio_sync_state (
      id TEXT PRIMARY KEY DEFAULT 'default',
      server_url TEXT NOT NULL DEFAULT '',
      server_id TEXT NOT NULL DEFAULT '',
      sync_mode TEXT NOT NULL DEFAULT 'merge_local_remote',
      last_sync_at INTEGER NOT NULL DEFAULT 0,
      connected INTEGER NOT NULL DEFAULT 0
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS audio_dislike_rules (
      id TEXT PRIMARY KEY,
      rule_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS index_audio_tracks_source ON audio_tracks(source)
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS index_audio_playlist_items_playlist ON audio_playlist_items(playlist_id, sort_order)
  `);const t=Date.now(),a=[{id:"default",name:"播放列表"},{id:"trial",name:"试听列表"},{id:"love",name:"我的收藏"},{id:"recent",name:"最近播放"},{id:"local",name:"本地音乐"}];for(const E of a)await e.execute(`INSERT OR IGNORE INTO audio_playlists (id, name, source, created_at, updated_at)
       VALUES (?, ?, 'builtin', ?, ?)`,[E.id,E.name,t,t])}const ue=102;async function ne(e){await e.execute(`
    CREATE TABLE IF NOT EXISTS audio_download_tasks (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      track_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      progress REAL NOT NULL DEFAULT 0,
      source_url TEXT NOT NULL DEFAULT '',
      local_path TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS index_audio_download_tasks_status ON audio_download_tasks(status)
  `)}const _e=104;async function x(e,t){return(await e.select("SELECT name FROM sqlite_master WHERE type='table' AND name = ?",[t])).length>0}async function de(e,t,a){return await x(e,t)?(await e.select(`PRAGMA table_info(${t})`)).some(N=>N.name===a):!1}async function k(e,t,a,E){await de(e,t,a)||await e.execute(`ALTER TABLE ${t} ADD COLUMN ${a} ${E}`)}const M={default:r.MusicDefault,trial:r.MusicTrial,recent:r.MusicRecent,local:r.MusicLocal};async function Ie(e){(await x(e,"media_groups")?"media_groups":"book_groups")==="book_groups"&&await e.execute("ALTER TABLE book_groups RENAME TO media_groups"),await k(e,"media_groups","domain","TEXT NOT NULL DEFAULT 'shelf'"),await k(e,"media_groups","listId","TEXT"),await k(e,"media_groups","source","TEXT"),await e.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS index_media_groups_listId
    ON media_groups(listId) WHERE listId IS NOT NULL
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS media_group_items (
      group_id INTEGER NOT NULL,
      item_kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, item_kind, item_id)
    )
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS idx_mgi_group ON media_group_items(group_id, sort_order)
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS media_preview_items (
      id TEXT PRIMARY KEY,
      media_kind TEXT NOT NULL,
      title TEXT,
      author TEXT,
      cover_url TEXT,
      ref_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_opened_at INTEGER
    )
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS idx_mpi_kind ON media_preview_items(media_kind, last_opened_at DESC)
  `),await e.execute("DELETE FROM media_groups WHERE groupId IN (-3, -6)");const a=Date.now();if(await e.execute(`INSERT OR IGNORE INTO media_groups
      (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
     VALUES (?, ?, ?, 0, 1, -1, 0, 'shared', NULL, NULL)`,[r.Favorite,"收藏",-4]),await e.execute(`INSERT OR IGNORE INTO media_groups
      (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
     VALUES (?, ?, ?, 0, 1, -1, 0, 'shared', NULL, NULL)`,[r.Preview,"试读/试听/试看",-3]),await x(e,"audio_playlists")){const E=await e.select("SELECT * FROM audio_playlists ORDER BY updated_at DESC");let N=r.MusicUserStart;for(const u of E){const n=String(u.id);if(n==="love")continue;let d=M[n];d==null&&(d=N,N-=1),await e.execute(`INSERT OR IGNORE INTO media_groups
          (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
         VALUES (?, ?, ?, 0, 1, -1, 0, 'music', ?, ?)`,[d,String(u.name),n==="local"?-2:n==="recent"?-1:0,n,String(u.source??"builtin")])}const _=await e.select("SELECT playlist_id, track_id, sort_order FROM audio_playlist_items ORDER BY playlist_id, sort_order");for(const u of _){const n=String(u.playlist_id),d=String(u.track_id),c=Number(u.sort_order??0);if(n==="love"){await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,[r.Favorite,d,c,a]);continue}const I=M[n];if(I==null){const U=await e.select("SELECT groupId FROM media_groups WHERE listId = ? LIMIT 1",[n]);if(!U[0])continue;await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,[U[0].groupId,d,c,a])}else await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,[I,d,c,a])}}}const Re=105;async function Oe(e,t){return(await e.select("SELECT name FROM sqlite_master WHERE type='table' AND name = ?",[t])).length>0}async function $(e,t){var E;return((E=(await e.select("SELECT type FROM sqlite_master WHERE name = ?",[t]))[0])==null?void 0:E.type)==="view"}async function le(e){const t=Date.now(),a=await e.select("SELECT groupId FROM media_groups WHERE groupId > 0 AND domain = 'shelf'"),E=await e.select('SELECT bookUrl, "group" AS groupMask FROM books WHERE "group" > 0');for(const _ of E){const u=Number(_.groupMask??0);if(u){for(const n of a){const d=Number(n.groupId);(u&d)>0&&await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'book', ?, 0, ?)`,[d,_.bookUrl,t])}(u&r.Favorite)>0&&await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
         VALUES (?, 'book', ?, 0, ?)`,[r.Favorite,_.bookUrl,t])}}const N=a.reduce((_,u)=>_|Number(u.groupId),0);if(N>0&&await e.execute('UPDATE books SET "group" = "group" & ~? WHERE "group" > 0',[N]),await Oe(e,"audio_playlist_items")&&!await $(e,"audio_playlist_items")){const u=await e.select(`SELECT api.playlist_id, api.track_id, api.sort_order
         FROM audio_playlist_items api
         LEFT JOIN media_group_items mgi
           ON mgi.item_id = api.track_id AND mgi.item_kind = 'track'
         LEFT JOIN media_groups mg ON mg.groupId = mgi.group_id AND mg.listId = api.playlist_id
         WHERE mgi.item_id IS NULL`);for(const n of u){const d=String(n.playlist_id),c=String(n.track_id),I=Number(n.sort_order??0),U=await e.select("SELECT groupId FROM media_groups WHERE listId = ? LIMIT 1",[d]);U[0]&&await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,[U[0].groupId,c,I,t])}await e.execute("DROP TABLE audio_playlist_items")}await $(e,"audio_playlist_items")||await e.execute(`
      CREATE VIEW IF NOT EXISTS audio_playlist_items AS
      SELECT mg.listId AS playlist_id, mgi.item_id AS track_id, mgi.sort_order
      FROM media_group_items mgi
      INNER JOIN media_groups mg ON mg.groupId = mgi.group_id AND mg.domain = 'music'
      WHERE mgi.item_kind = 'track'
    `)}const Ue=106;async function Ae(e){await e.execute(`UPDATE media_groups
     SET groupName = '试听列表', "order" = -4
     WHERE groupId = ? AND domain = 'music'`,[r.MusicDefault]),await e.execute(`UPDATE media_groups SET groupName = '最近播放', "order" = -3 WHERE groupId = ?`,[r.MusicRecent]),await e.execute(`UPDATE media_groups SET groupName = '本地音乐', "order" = -2 WHERE groupId = ?`,[r.MusicLocal]),await e.execute("UPDATE audio_playlists SET name = '试听列表' WHERE id = 'default'"),await e.execute("UPDATE audio_playlists SET name = '我的收藏' WHERE id = 'love'")}const pe=["core","shell","reader","audio","video","subscribe"],me={core:6,shell:4,reader:6,audio:8,video:9,subscribe:2};async function W(e){await e.execute(`
    CREATE TABLE IF NOT EXISTS ${v.schemaModules} (
      module TEXT PRIMARY KEY,
      version INTEGER NOT NULL
    )
  `)}async function Se(e,t=me){await W(e);for(const a of pe){const E=t[a]??0;await e.execute(`INSERT INTO ${v.schemaModules} (module, version) VALUES (?, ?)
       ON CONFLICT(module) DO UPDATE SET version = excluded.version`,[a,E])}}async function s(e,t,a){await W(e),await e.execute(`INSERT INTO ${v.schemaModules} (module, version) VALUES (?, ?)
     ON CONFLICT(module) DO UPDATE SET version = excluded.version`,[t,a])}const we=110;async function Xe(e){await Se(e,{core:1,shell:1,reader:1,audio:1,video:1,subscribe:1})}const ge=111,De=[{id:"kw",name:"酷我",customOrder:1},{id:"kg",name:"酷狗",customOrder:2},{id:"tx",name:"QQ音乐",customOrder:3},{id:"wy",name:"网易云",customOrder:4},{id:"mg",name:"咪咕",customOrder:5},{id:"local",name:"本地",customOrder:6}];async function Fe(e){await Ce(e),await ke(e),await fe(e),await ye(e),await xe(e),await he(e),await s(e,"reader",2),await s(e,"audio",2),await s(e,"shell",2),await s(e,"subscribe",2),await s(e,"video",2)}async function Ce(e){await e.execute(`
    CREATE TABLE IF NOT EXISTS ${o.bookGroups} (
      groupId INTEGER PRIMARY KEY,
      groupName TEXT NOT NULL,
      cover TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      enableRefresh INTEGER NOT NULL DEFAULT 1,
      show INTEGER NOT NULL DEFAULT 1,
      bookSort INTEGER NOT NULL DEFAULT -1,
      onlyUpdateRead INTEGER NOT NULL DEFAULT 0
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${o.bookGroupItems} (
      group_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, item_id)
    )
  `),await e.execute(`CREATE INDEX IF NOT EXISTS idx_rbgi_group ON ${o.bookGroupItems}(group_id, sort_order)`),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${i.groups} (
      groupId INTEGER PRIMARY KEY,
      groupName TEXT NOT NULL,
      cover TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      enableRefresh INTEGER NOT NULL DEFAULT 0,
      show INTEGER NOT NULL DEFAULT 1,
      bookSort INTEGER NOT NULL DEFAULT -1,
      onlyUpdateRead INTEGER NOT NULL DEFAULT 0,
      listId TEXT,
      source TEXT,
      description TEXT
    )
  `),await e.execute(`CREATE UNIQUE INDEX IF NOT EXISTS index_audio_groups_listId
     ON ${i.groups}(listId) WHERE listId IS NOT NULL`),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${i.groupItems} (
      group_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, item_id)
    )
  `),await e.execute(`CREATE INDEX IF NOT EXISTS idx_agi_group ON ${i.groupItems}(group_id, sort_order)`),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${O.favorites} (
      item_kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (item_kind, item_id)
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${O.previewItems} (
      id TEXT PRIMARY KEY,
      media_kind TEXT NOT NULL,
      title TEXT,
      author TEXT,
      cover_url TEXT,
      ref_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_opened_at INTEGER
    )
  `),await e.execute(`CREATE INDEX IF NOT EXISTS idx_shell_preview_kind
     ON ${O.previewItems}(media_kind, last_opened_at DESC)`),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${i.sources} (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'builtin',
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      script TEXT,
      script_url TEXT,
      version TEXT,
      custom_order INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${i.searchKeywords} (
      word TEXT NOT NULL PRIMARY KEY,
      usage INTEGER NOT NULL DEFAULT 1,
      lastUseTime INTEGER NOT NULL
    )
  `)}async function ke(e){await L(e,"media_groups")&&(await e.execute(`
    INSERT OR IGNORE INTO ${o.bookGroups}
      (groupId, groupName, cover, "order", enableRefresh, show, bookSort, onlyUpdateRead)
    SELECT groupId, groupName, cover, "order", enableRefresh, show, bookSort, onlyUpdateRead
    FROM media_groups
    WHERE domain = 'shelf'
       OR (domain IS NULL AND groupId NOT IN (-7, -8) AND groupId > -20)
  `),await e.execute(`
    INSERT OR IGNORE INTO ${i.groups}
      (groupId, groupName, cover, "order", enableRefresh, show, bookSort, onlyUpdateRead, listId, source)
    SELECT groupId, groupName, cover, "order", enableRefresh, show, bookSort, onlyUpdateRead, listId, source
    FROM media_groups
    WHERE domain = 'music'
  `),await L(e,"media_group_items")&&(await e.execute(`
      INSERT OR IGNORE INTO ${o.bookGroupItems}
        (group_id, item_id, sort_order, created_at)
      SELECT group_id, item_id, sort_order, created_at
      FROM media_group_items
      WHERE item_kind = 'book' AND group_id != -7
    `),await e.execute(`
      INSERT OR IGNORE INTO ${i.groupItems}
        (group_id, item_id, sort_order, created_at)
      SELECT group_id, item_id, sort_order, created_at
      FROM media_group_items
      WHERE item_kind = 'track' AND group_id != -7
    `),await e.execute(`
      INSERT OR IGNORE INTO ${O.favorites}
        (item_kind, item_id, sort_order, created_at)
      SELECT item_kind, item_id, sort_order, created_at
      FROM media_group_items
      WHERE group_id = -7
    `)),await L(e,"media_preview_items")&&await e.execute(`
      INSERT OR IGNORE INTO ${O.previewItems}
        (id, media_kind, title, author, cover_url, ref_json, created_at, last_opened_at)
      SELECT id, media_kind, title, author, cover_url, ref_json, created_at, last_opened_at
      FROM media_preview_items
    `))}async function fe(e){const t=Date.now();for(const a of De)await e.execute(`INSERT OR IGNORE INTO ${i.sources}
        (id, kind, name, enabled, script, script_url, version, custom_order, meta_json, created_at, updated_at)
       VALUES (?, 'builtin', ?, 1, NULL, NULL, NULL, ?, '{}', ?, ?)`,[a.id,a.name,a.customOrder,t,t])}async function ye(e){await e.execute(`
    CREATE TABLE IF NOT EXISTS ${T.searchKeywords} (
      word TEXT NOT NULL PRIMARY KEY,
      usage INTEGER NOT NULL DEFAULT 1,
      lastUseTime INTEGER NOT NULL
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${S.sources} (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'opml',
      title TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fetch_at INTEGER,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${S.feeds} (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      feed_url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      site_url TEXT,
      description TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `),await e.execute(`CREATE INDEX IF NOT EXISTS idx_sub_feeds_source ON ${S.feeds}(source_id)`),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${S.entries} (
      id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      url TEXT,
      author TEXT,
      published_at INTEGER,
      read INTEGER NOT NULL DEFAULT 0,
      starred INTEGER NOT NULL DEFAULT 0,
      content TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    )
  `),await e.execute(`CREATE INDEX IF NOT EXISTS idx_sub_entries_feed ON ${S.entries}(feed_id, published_at DESC)`),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${S.searchKeywords} (
      word TEXT NOT NULL PRIMARY KEY,
      usage INTEGER NOT NULL DEFAULT 1,
      lastUseTime INTEGER NOT NULL
    )
  `)}async function xe(e){await p(e,"audio_playlist_items"),await l(e,"media_group_items"),await l(e,"media_preview_items"),await l(e,"media_groups")}async function he(e){await e.execute(`
    CREATE VIEW IF NOT EXISTS audio_playlist_items AS
    SELECT
      g.listId AS playlist_id,
      i.item_id AS track_id,
      i.sort_order AS sort_order
    FROM ${i.groupItems} i
    INNER JOIN ${i.groups} g ON g.groupId = i.group_id
    WHERE g.listId IS NOT NULL
  `)}const ve=112,X=[{from:"books",to:o.books},{from:"chapters",to:o.chapters},{from:"chapter_cache",to:o.chapterCache},{from:"book_sources",to:o.bookSources},{from:"searchBooks",to:o.searchBooks},{from:"search_keywords",to:o.searchKeywords},{from:"replace_rules",to:o.replaceRules},{from:"rssSources",to:o.rssSources},{from:"rssArticles",to:o.rssArticles},{from:"rssStars",to:o.rssStars},{from:"rssReadRecords",to:o.rssReadRecords},{from:"bookmarks",to:o.bookmarks},{from:"readRecord",to:o.readRecord},{from:"readRecordDetail",to:o.readRecordDetail},{from:"readRecordSession",to:o.readRecordSession},{from:"httpTTS",to:o.httpTts},{from:"txtTocRules",to:o.txtTocRules},{from:"dictRules",to:o.dictRules},{from:"ruleSubs",to:o.ruleSubs},{from:"keyboardAssists",to:o.keyboardAssists}];async function Ge(e){for(const{from:t,to:a}of X)await C(e,t,a);for(const{from:t,to:a}of X)await L(e,a)&&await q(e,t,a);await s(e,"reader",3)}const Me=113,$e=[{from:"tv_config",to:T.configs},{from:"tv_history",to:"video_history"},{from:"tv_keep",to:"video_keep"},{from:"tv_site_pref",to:T.sitePref}],Pe=[{from:"theme_presets",to:O.themePresets},{from:"cookies",to:O.cookies},{from:"caches",to:O.caches},{from:"servers",to:O.servers}];async function Ye(e){for(const{from:t,to:a}of $e)await C(e,t,a);await C(e,"music_playback_state",i.playbackState);for(const{from:t,to:a}of Pe)await C(e,t,a);await e.execute(`
    CREATE TABLE IF NOT EXISTS ${T.searchKeywords} (
      word TEXT NOT NULL PRIMARY KEY,
      usage INTEGER NOT NULL DEFAULT 1,
      lastUseTime INTEGER NOT NULL
    )
  `);for(const{from:t}of X)await p(e,t);if(await p(e,"audio_playlist_items"),!await L(e,o.bookGroups))throw new Error(`M4 期望表 ${o.bookGroups} 不存在`);if(!await L(e,i.groups))throw new Error(`M4 期望表 ${i.groups} 不存在`);await s(e,"video",4),await s(e,"shell",4),await s(e,"audio",4),await s(e,"core",4)}const Ve=114;async function f(e,t,a){return await L(e,t)?(await e.select(`PRAGMA table_info(${t})`)).some(N=>N.name===a):!1}async function He(e){if(await L(e,i.groups)&&!await f(e,i.groups,"description")&&await e.execute(`ALTER TABLE ${i.groups} ADD COLUMN description TEXT`),await L(e,"audio_playlists")){const t=await f(e,"audio_playlists","cover_url"),a=await f(e,"audio_playlists","description");t&&await e.execute(`
        UPDATE ${i.groups}
        SET cover = (
          SELECT p.cover_url FROM audio_playlists p
          WHERE p.id = ${i.groups}.listId
        )
        WHERE listId IS NOT NULL
          AND (cover IS NULL OR cover = '')
          AND EXISTS (
            SELECT 1 FROM audio_playlists p
            WHERE p.id = ${i.groups}.listId AND p.cover_url IS NOT NULL AND p.cover_url != ''
          )
      `),a&&await e.execute(`
        UPDATE ${i.groups}
        SET description = (
          SELECT p.description FROM audio_playlists p
          WHERE p.id = ${i.groups}.listId
        )
        WHERE listId IS NOT NULL
          AND (description IS NULL OR description = '')
          AND EXISTS (
            SELECT 1 FROM audio_playlists p
            WHERE p.id = ${i.groups}.listId AND p.description IS NOT NULL AND p.description != ''
          )
      `),await l(e,"audio_playlists")}await te(e),await l(e,"upload_histories"),await l(e,"direct_link_upload_rules"),await l(e,"url_records"),await s(e,"audio",5),await s(e,"reader",5),await s(e,"core",5)}const Be=115,P={books:o.books,book_sources:o.bookSources};async function m(e,t){const a=Date.now();console.log(`[v115] ▶ ${e}`),await t(),console.log(`[v115] ✓ ${e} (${Date.now()-a}ms)`)}async function g(e,t){var E;if(!await L(e,t))return 0;const a=await e.select(`SELECT COUNT(*) as c FROM "${t}"`);return Number(((E=a[0])==null?void 0:E.c)??0)}async function j(e){await G(e,async()=>{await m("tv_* → video_* 双轨合并",async()=>{await A(e,"tv_config",T.configs),await A(e,"tv_history","video_history"),await A(e,"tv_keep","video_keep"),await A(e,"tv_site_pref",T.sitePref)});const t=await g(e,"chapters"),a=await g(e,o.chapters);console.log(`[v115] chapters 行数: legacy=${t}, reader=${a}`),await m("合并 chapters / txtTocRules（大表可能较慢）",async()=>{await A(e,"chapters",o.chapters),await A(e,"txtTocRules",o.txtTocRules)}),await m("重定向 chapters/searchBooks 外键 → reader_*",async()=>{await w(e,o.chapters,P),await w(e,o.searchBooks,P)}),await m("创建 video_tracks / groups / group_items",async()=>{await e.execute(`
        CREATE TABLE IF NOT EXISTS ${T.tracks} (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL DEFAULT '',
          site_key TEXT NOT NULL DEFAULT '',
          vod_id TEXT NOT NULL DEFAULT '',
          cover_url TEXT,
          kind TEXT NOT NULL DEFAULT 'vod',
          cid INTEGER NOT NULL DEFAULT 0,
          flag TEXT NOT NULL DEFAULT '',
          episode TEXT NOT NULL DEFAULT '',
          position REAL NOT NULL DEFAULT 0,
          duration REAL NOT NULL DEFAULT 0,
          meta_json TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL DEFAULT 0
        )
      `),await e.execute(`CREATE INDEX IF NOT EXISTS idx_video_tracks_updated
         ON ${T.tracks}(updated_at DESC)`),await e.execute(`
        CREATE TABLE IF NOT EXISTS ${T.groups} (
          groupId INTEGER PRIMARY KEY,
          groupName TEXT NOT NULL,
          cover TEXT,
          "order" INTEGER NOT NULL DEFAULT 0,
          enableRefresh INTEGER NOT NULL DEFAULT 0,
          show INTEGER NOT NULL DEFAULT 1,
          bookSort INTEGER NOT NULL DEFAULT -1,
          onlyUpdateRead INTEGER NOT NULL DEFAULT 0,
          listId TEXT,
          source TEXT,
          description TEXT
        )
      `),await e.execute(`CREATE UNIQUE INDEX IF NOT EXISTS index_video_groups_listId
         ON ${T.groups}(listId) WHERE listId IS NOT NULL`),await e.execute(`
        CREATE TABLE IF NOT EXISTS ${T.groupItems} (
          group_id INTEGER NOT NULL,
          item_id TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (group_id, item_id)
        )
      `),await e.execute(`CREATE INDEX IF NOT EXISTS idx_vgi_group ON ${T.groupItems}(group_id, sort_order)`),await e.execute(`INSERT OR IGNORE INTO ${T.groups}
          (groupId, groupName, "order", enableRefresh, show, bookSort, listId, source)
         VALUES (?, '最近观看', -2, 0, 1, -1, 'recent', 'builtin')`,[r.VideoRecent]),await e.execute(`INSERT OR IGNORE INTO ${T.groups}
          (groupId, groupName, "order", enableRefresh, show, bookSort, listId, source)
         VALUES (?, '我的收藏', -1, 0, 1, -1, 'keep', 'builtin')`,[r.VideoKeep])}),await m("video_history → tracks + recent（集合插入）",async()=>{if(!await L(e,"video_history"))return;const E=await g(e,"video_history");console.log(`[v115] video_history 行数=${E}`),await e.execute(`
        INSERT INTO ${T.tracks}
          (id, name, site_key, vod_id, cover_url, kind, cid, flag, episode, position, duration, meta_json, created_at, updated_at)
        SELECT
          key,
          COALESCE(vod_name, ''),
          COALESCE(site_key, ''),
          COALESCE(vod_id, ''),
          vod_pic,
          'vod',
          COALESCE(cid, 0),
          COALESCE(flag, ''),
          COALESCE(episode, ''),
          COALESCE(position, 0),
          COALESCE(duration, 0),
          '{}',
          COALESCE(updated_at, 0),
          COALESCE(updated_at, 0)
        FROM video_history
        WHERE key IS NOT NULL AND key != ''
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, site_key=excluded.site_key, vod_id=excluded.vod_id,
          cover_url=excluded.cover_url, cid=excluded.cid, flag=excluded.flag,
          episode=excluded.episode, position=excluded.position, duration=excluded.duration,
          updated_at=excluded.updated_at
      `),await e.execute(`
        INSERT OR IGNORE INTO ${T.groupItems}
          (group_id, item_id, sort_order, created_at)
        SELECT ?, key, 0, COALESCE(updated_at, 0)
        FROM video_history
        WHERE key IS NOT NULL AND key != ''
        `,[r.VideoRecent]),await l(e,"video_history")}),await m("video_keep → tracks + keep（集合插入）",async()=>{if(!await L(e,"video_keep"))return;const E=await g(e,"video_keep");console.log(`[v115] video_keep 行数=${E}`),await e.execute(`
        INSERT INTO ${T.tracks}
          (id, name, site_key, vod_id, cover_url, kind, cid, flag, episode, position, duration, meta_json, created_at, updated_at)
        SELECT
          key,
          COALESCE(vod_name, ''),
          COALESCE(site_key, ''),
          COALESCE(vod_id, ''),
          vod_pic,
          COALESCE(kind, 'vod'),
          COALESCE(cid, 0),
          '',
          '',
          0,
          0,
          '{}',
          COALESCE(created_at, 0),
          COALESCE(created_at, 0)
        FROM video_keep
        WHERE key IS NOT NULL AND key != ''
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, site_key=excluded.site_key, vod_id=excluded.vod_id,
          cover_url=excluded.cover_url, kind=excluded.kind, cid=excluded.cid
      `),await e.execute(`
        INSERT OR IGNORE INTO ${T.groupItems}
          (group_id, item_id, sort_order, created_at)
        SELECT ?, key, 0, COALESCE(created_at, 0)
        FROM video_keep
        WHERE key IS NOT NULL AND key != ''
        `,[r.VideoKeep]),await l(e,"video_keep")}),await m("DROP 残留 tv_* / chapters / txtTocRules",async()=>{for(const E of["tv_config","tv_history","tv_keep","tv_site_pref","chapters","txtTocRules"])await l(e,E)})}),await s(e,"video",6),await s(e,"reader",6),await s(e,"core",6)}const Ke=116,Y=[{from:"theme_presets",to:O.themePresets},{from:"cookies",to:O.cookies},{from:"caches",to:O.caches},{from:"servers",to:O.servers}],We=[{from:"tv_config",to:T.configs},{from:"tv_site_pref",to:T.sitePref},{from:"tv_history",to:"video_history"},{from:"tv_keep",to:"video_keep"}],je=["chapters","chapter_cache","searchBooks","bookmarks","rssArticles","rssStars","rssReadRecords","readRecordDetail","readRecordSession","readRecord","search_keywords","replace_rules","httpTTS","txtTocRules","dictRules","ruleSubs","keyboardAssists","rssSources","book_sources","books","theme_presets","cookies","caches","servers","music_playback_state","audio_playlists","audio_playlist_items","tv_config","tv_history","tv_keep","tv_site_pref","video_history","video_keep","media_group_items","media_groups","media_preview_items"],D={books:o.books,book_sources:o.bookSources};async function Je(e){const t=Date.now();console.log("[v116] ▶ 开始双轨清理"),await G(e,async()=>{console.log("[v116] ▶ 清理兼容 VIEW");for(const{from:a}of X)await p(e,a);for(const{from:a}of Y)await p(e,a);await p(e,"music_playback_state"),await p(e,"audio_playlist_items"),console.log("[v116] ▶ 合并阅读无前缀表（大表可能较慢）");for(const{from:a,to:E}of X){const N=Date.now();await A(e,a,E),console.log(`[v116]   ${a} → ${E} (${Date.now()-N}ms)`)}console.log("[v116] ▶ 合并壳表 / playback / tv_*");for(const{from:a,to:E}of Y)await A(e,a,E);await A(e,"music_playback_state",i.playbackState);for(const{from:a,to:E}of We)await A(e,a,E);console.log("[v116] ▶ 重定向外键"),await w(e,o.chapters,D),await w(e,o.searchBooks,D),await w(e,"chapters",D),await w(e,"searchBooks",D),console.log("[v116] ▶ 调用 v115 逻辑（幂等）"),await j(e),console.log("[v116] ▶ DROP 旧名");for(const a of je)await p(e,a),await l(e,a)}),await s(e,"reader",7),await s(e,"shell",7),await s(e,"audio",7),await s(e,"video",7),await s(e,"core",7),console.log(`[v116] ✓ 完成 (${Date.now()-t}ms)`)}const Qe=117;function qe(e){const t=(e||"").trim().toLowerCase();return!t||t.startsWith("pasted:")||t==="pasted"?"paste":t.startsWith("file:")||t.startsWith("/")||/^[a-z]:[\\/]/i.test(t)?"local":t.startsWith("http://")||t.startsWith("https://")?"url":"local"}async function ze(e){var E;if(await e.execute(`
    CREATE TABLE IF NOT EXISTS ${T.sources} (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'url',
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      script TEXT,
      script_url TEXT,
      version TEXT,
      custom_order INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `),await e.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_video_sources_script_url
    ON ${T.sources}(script_url)
    WHERE script_url IS NOT NULL AND script_url != ''
  `),(((E=(await e.select(`SELECT COUNT(*) AS c FROM ${T.sources}`))[0])==null?void 0:E.c)??0)>0){await V(e),await s(e,"video",5);return}const a=await L(e,"video_configs")?"video_configs":await L(e,"tv_config")?"tv_config":null;if(a){const N=await e.select(`SELECT id, url, name, type, json, updated_at FROM "${a}" ORDER BY updated_at ASC`),_=new Map,u=[];for(const c of N){const I=(c.url||"").trim();if(!I){u.push(c);continue}const U=_.get(I);(!U||c.updated_at>=U.updated_at)&&_.set(I,c)}const n=[..._.values(),...u].sort((c,I)=>c.updated_at-I.updated_at);let d=0;for(const c of n){const I=(c.url||"").trim(),U=I||null,Q=JSON.stringify({type:Number(c.type)||0});await e.execute(`INSERT OR IGNORE INTO ${T.sources}
          (id, kind, name, enabled, script, script_url, version, custom_order, meta_json, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, NULL, ?, ?, ?, ?)`,[String(c.id),qe(I),c.name||I||`source-${c.id}`,c.json??"",U,d++,Q,c.updated_at||Date.now(),c.updated_at||Date.now()])}}await V(e),await s(e,"video",5)}async function V(e){await l(e,"video_configs"),await l(e,"tv_config")}const Ze=118;async function h(e,t){return(await e.select("SELECT name FROM sqlite_master WHERE type='table' AND name = ?",[t])).length>0}async function be(e,t,a){return await h(e,t)?(await e.select(`PRAGMA table_info(${t})`)).some(N=>N.name===a):!1}async function R(e,t,a,E){await be(e,t,a)||(console.log(`[数据库迁移] ${t} 添加 ${a}`),await e.execute(`ALTER TABLE ${t} ADD COLUMN ${a} ${E}`))}async function et(e){const t=i.tracks,a=i.downloadTasks;await h(e,t)&&(await R(e,t,"cache_path","TEXT"),await R(e,t,"cache_tier","TEXT"),await R(e,t,"cached_at","INTEGER"),await R(e,t,"cache_bytes","INTEGER"),await R(e,t,"cache_mime","TEXT"),await R(e,t,"cache_quality","TEXT"),await e.execute(`CREATE INDEX IF NOT EXISTS index_audio_tracks_cache_tier ON ${t}(cache_tier)`)),await h(e,a)&&(await R(e,a,"quality","TEXT NOT NULL DEFAULT ''"),await R(e,a,"ext","TEXT NOT NULL DEFAULT 'mp3'"),await R(e,a,"file_name","TEXT NOT NULL DEFAULT ''"),await R(e,a,"progress_downloaded","INTEGER NOT NULL DEFAULT 0"),await R(e,a,"progress_total","INTEGER NOT NULL DEFAULT 0"),await R(e,a,"status_text","TEXT NOT NULL DEFAULT ''"),await R(e,a,"position","INTEGER NOT NULL DEFAULT 0"),await e.execute(`UPDATE ${a} SET status = 'waiting', status_text = '等待下载' WHERE status = 'pending'`),await e.execute(`UPDATE ${a} SET status = 'run', status_text = '正在下载' WHERE status = 'downloading'`),await e.execute(`UPDATE ${a} SET status = 'error', status_text = '任务出错' WHERE status = 'failed'`),await e.execute(`UPDATE ${a} SET status = 'completed', status_text = '下载完成' WHERE status = 'completed' AND (status_text IS NULL OR status_text = '')`)),await s(e,"audio",6)}const tt=119;async function at(e){await e.execute(`
    CREATE TABLE IF NOT EXISTS ${i.lyricCache} (
      track_id TEXT PRIMARY KEY NOT NULL,
      lyric_json TEXT NOT NULL,
      has_lx INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `),await e.execute(`CREATE INDEX IF NOT EXISTS index_audio_lyric_cache_created_at ON ${i.lyricCache}(created_at)`),await s(e,"audio",7)}const Tt=120,y=-30,F=-31;async function Et(e,t,a){return(await e.select(`PRAGMA table_info(${t})`)??[]).some(N=>N.name===a)}async function H(e,t,a,E){await Et(e,t,a)||await e.execute(`ALTER TABLE ${t} ADD COLUMN ${a} ${E}`)}async function ot(e){await G(e,async()=>{if(await e.execute(`
      CREATE TABLE IF NOT EXISTS ${T.playRecord} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        site_key TEXT NOT NULL DEFAULT '',
        vod_id TEXT NOT NULL DEFAULT '',
        cover_url TEXT,
        kind TEXT NOT NULL DEFAULT 'vod',
        cid INTEGER NOT NULL DEFAULT 0,
        flag TEXT NOT NULL DEFAULT '',
        episode TEXT NOT NULL DEFAULT '',
        position REAL NOT NULL DEFAULT 0,
        duration REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `),await e.execute(`CREATE INDEX IF NOT EXISTS idx_video_play_record_updated
       ON ${T.playRecord}(updated_at DESC)`),await L(e,T.tracks)&&(await H(e,T.tracks,"library","INTEGER NOT NULL DEFAULT 0"),await H(e,T.tracks,"library_order","INTEGER NOT NULL DEFAULT 0")),await L(e,T.tracks)&&await L(e,T.groupItems)&&await e.execute(`INSERT OR REPLACE INTO ${T.playRecord}
          (id, name, site_key, vod_id, cover_url, kind, cid, flag, episode, position, duration, created_at, updated_at)
         SELECT t.id, t.name, t.site_key, t.vod_id, t.cover_url, t.kind, t.cid,
                t.flag, t.episode, t.position, t.duration,
                COALESCE(NULLIF(i.created_at, 0), t.created_at, t.updated_at),
                COALESCE(NULLIF(t.updated_at, 0), i.created_at, t.created_at)
         FROM ${T.tracks} t
         INNER JOIN ${T.groupItems} i
           ON i.item_id = t.id AND i.group_id = ?`,[y]),await L(e,T.tracks)&&await L(e,T.groupItems)&&await e.execute(`UPDATE ${T.tracks}
         SET library = 1,
             library_order = COALESCE(
               (SELECT i.sort_order FROM ${T.groupItems} i
                WHERE i.item_id = ${T.tracks}.id AND i.group_id = ?),
               library_order
             )
         WHERE id IN (
           SELECT item_id FROM ${T.groupItems} WHERE group_id = ?
         )`,[F,F]),await L(e,T.groupItems)&&await e.execute(`DELETE FROM ${T.groupItems} WHERE group_id IN (?, ?)`,[y,F]),await L(e,T.groups)){await e.execute(`DELETE FROM ${T.groups} WHERE groupId IN (?, ?)
          OR listId IN ('recent', 'keep')`,[y,F]);const t=[[r.VideoAll,"全部",-10,"all"],[r.VideoVod,"点播",-9,"vod"],[r.VideoLive,"直播",-8,"live"],[r.VideoLocal,"本地",-7,"local"]];for(const[a,E,N,_]of t)await e.execute(`INSERT OR IGNORE INTO ${T.groups}
            (groupId, groupName, "order", enableRefresh, show, bookSort, listId, source)
           VALUES (?, ?, ?, 0, 1, -1, ?, 'builtin')`,[a,E,N,_]),await e.execute(`UPDATE ${T.groups}
           SET groupName = ?, "order" = ?, listId = ?, source = 'builtin', show = 1
           WHERE groupId = ?`,[E,N,_,a])}}),await s(e,"video",8)}const it=121;async function J(e,t){return(await e.select("SELECT name FROM sqlite_master WHERE type='table' AND name = ?",[t])).length>0}async function rt(e,t,a){return await J(e,t)?(await e.select(`PRAGMA table_info(${t})`)).some(N=>N.name===a):!1}async function B(e,t,a,E){await rt(e,t,a)||(console.log(`[数据库迁移] ${t} 添加 ${a}`),await e.execute(`ALTER TABLE ${t} ADD COLUMN ${a} ${E}`))}async function st(e){const t=i.downloadTasks;await J(e,t)&&(await B(e,t,"resolved_source","TEXT NOT NULL DEFAULT ''"),await B(e,t,"task_meta","TEXT NOT NULL DEFAULT ''")),await s(e,"audio",8)}const Nt=122;async function Lt(e){if(await e.execute(`
    CREATE TABLE IF NOT EXISTS ${T.bangumiRules} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      payload_json TEXT NOT NULL DEFAULT '{}',
      kazumi_api TEXT,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `),await e.execute(`CREATE INDEX IF NOT EXISTS idx_video_bangumi_rules_enabled
     ON ${T.bangumiRules}(enabled, name)`),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${T.bangumiRuleSubs} (
      url TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fetch_at INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${T.bangumiSubjects} (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      name_cn TEXT NOT NULL DEFAULT '',
      cover TEXT,
      score REAL NOT NULL DEFAULT 0,
      air_date TEXT,
      air_weekday INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      summary TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      fetched_at INTEGER NOT NULL DEFAULT 0
    )
  `),await e.execute(`CREATE INDEX IF NOT EXISTS idx_video_bangumi_subjects_fetched
     ON ${T.bangumiSubjects}(fetched_at DESC)`),await e.execute(`
    CREATE TABLE IF NOT EXISTS ${T.bangumiPrefs} (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL DEFAULT 'null'
    )
  `),await L(e,T.groups)){const t=r.VideoBangumi,a="番剧",E=-6,N="bangumi";await e.execute(`INSERT OR IGNORE INTO ${T.groups}
        (groupId, groupName, "order", enableRefresh, show, bookSort, listId, source)
       VALUES (?, ?, ?, 0, 1, -1, ?, 'builtin')`,[t,a,E,N]),await e.execute(`UPDATE ${T.groups}
       SET groupName = ?, "order" = ?, listId = ?, source = 'builtin', show = 1
       WHERE groupId = ?`,[a,E,N,t])}await L(e,T.tracks)&&await e.execute(`UPDATE ${T.tracks}
       SET kind = 'bangumi'
       WHERE (id LIKE 'bangumi$%' OR site_key = 'bangumi') AND kind != 'bangumi'`),await L(e,T.playRecord)&&await e.execute(`UPDATE ${T.playRecord}
       SET kind = 'bangumi'
       WHERE (id LIKE 'bangumi$%' OR site_key = 'bangumi') AND kind != 'bangumi'`),await s(e,"video",9)}const ct=107;async function ut(e){const t=Date.now();await e.execute(`UPDATE media_groups
     SET groupName = '播放列表', "order" = -5
     WHERE groupId = ? AND domain = 'music'`,[r.MusicDefault]),await e.execute("UPDATE audio_playlists SET name = '播放列表' WHERE id = 'default'"),await e.execute(`INSERT OR IGNORE INTO audio_playlists (id, name, source, created_at, updated_at)
     VALUES ('trial', '试听列表', 'builtin', ?, ?)`,[t,t]),await e.execute(`INSERT OR IGNORE INTO media_groups
      (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
     VALUES (?, '试听列表', -4, 0, 1, -1, 0, 'music', 'trial', 'builtin')`,[r.MusicTrial]),await e.execute(`UPDATE media_groups SET groupName = '最近播放', "order" = -3 WHERE groupId = ?`,[r.MusicRecent]),await e.execute(`UPDATE media_groups SET groupName = '本地音乐', "order" = -2 WHERE groupId = ?`,[r.MusicLocal]),await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
     SELECT ?, 'track', r.item_id, r.sort_order, ?
     FROM media_group_items r
     WHERE r.group_id = ? AND r.item_kind = 'track'
       AND NOT EXISTS (
         SELECT 1
         FROM media_group_items o
         INNER JOIN media_groups g ON g.groupId = o.group_id
         WHERE o.item_kind = 'track'
           AND o.item_id = r.item_id
           AND (
             g.groupId = ?
             OR g.listId = 'local'
             OR g.listId LIKE 'pl_%'
           )
       )`,[r.MusicTrial,t,r.MusicRecent,r.Favorite])}const nt=108;async function _t(e){await e.execute(`
    CREATE TABLE IF NOT EXISTS tv_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      type INTEGER NOT NULL DEFAULT 0,
      json TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS tv_history (
      key TEXT PRIMARY KEY NOT NULL,
      site_key TEXT NOT NULL DEFAULT '',
      vod_id TEXT NOT NULL DEFAULT '',
      vod_name TEXT NOT NULL DEFAULT '',
      vod_pic TEXT NOT NULL DEFAULT '',
      flag TEXT NOT NULL DEFAULT '',
      episode TEXT NOT NULL DEFAULT '',
      position REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      cid INTEGER NOT NULL DEFAULT 0
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS tv_keep (
      key TEXT PRIMARY KEY NOT NULL,
      site_key TEXT NOT NULL DEFAULT '',
      vod_id TEXT NOT NULL DEFAULT '',
      vod_name TEXT NOT NULL DEFAULT '',
      vod_pic TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'vod',
      cid INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS tv_site_pref (
      key TEXT PRIMARY KEY NOT NULL,
      searchable INTEGER NOT NULL DEFAULT 1,
      changeable INTEGER NOT NULL DEFAULT 1
    )
  `),await e.execute("CREATE INDEX IF NOT EXISTS idx_tv_history_updated ON tv_history(updated_at DESC)")}const dt=109;async function It(e){await e.execute(`
    CREATE TABLE IF NOT EXISTS music_playback_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      list_id TEXT,
      track_index INTEGER NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      max_time REAL NOT NULL DEFAULT 0,
      player_list_name TEXT,
      player_list_kind TEXT,
      play_mode TEXT,
      tracks_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `)}const lt=[{version:1,up:async e=>{await e.execute(`
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
      `),await e.execute(`
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
      `),await e.execute(`
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
      `),await e.execute(`
        CREATE TABLE IF NOT EXISTS chapter_cache (
          book_url TEXT NOT NULL,
          chapter_index INTEGER NOT NULL,
          content TEXT,
          file_path TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY(book_url, chapter_index)
        )
      `),await e.execute(`
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
      `),await e.execute(`
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
      `),await e.execute(`
        CREATE TABLE IF NOT EXISTS search_keywords (
          word TEXT NOT NULL,
          usage INTEGER NOT NULL,
          lastUseTime INTEGER NOT NULL,
          PRIMARY KEY(word)
        )
      `),await e.execute(`
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
      `),await e.execute(`
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
      `),await e.execute(`
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
      `),await e.execute(`
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
      `),await e.execute(`
        CREATE TABLE IF NOT EXISTS rssReadRecords (
          record TEXT NOT NULL,
          title TEXT,
          readTime INTEGER,
          read INTEGER NOT NULL,
          PRIMARY KEY(record)
        )
      `),await e.execute(`
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
      `),await e.execute(`
        CREATE TABLE IF NOT EXISTS readRecord (
          deviceId TEXT NOT NULL,
          bookName TEXT NOT NULL,
          readTime INTEGER NOT NULL DEFAULT 0,
          lastRead INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(deviceId, bookName)
        )
      `),await e.execute(`
        CREATE TABLE IF NOT EXISTS cookies (
          url TEXT NOT NULL,
          cookie TEXT NOT NULL,
          PRIMARY KEY(url)
        )
      `),await e.execute(`
        CREATE TABLE IF NOT EXISTS caches (
          key TEXT NOT NULL,
          value TEXT,
          deadline INTEGER NOT NULL,
          PRIMARY KEY(key)
        )
      `),await e.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_books_name_author 
        ON books(name, author)
      `),await e.execute(`
        CREATE INDEX IF NOT EXISTS index_chapters_bookUrl 
        ON chapters(bookUrl)
      `),await e.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_chapters_bookUrl_index 
        ON chapters(bookUrl, "index")
      `),await e.execute(`
        CREATE INDEX IF NOT EXISTS index_book_sources_bookSourceUrl 
        ON book_sources(bookSourceUrl)
      `),await e.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_searchBooks_bookUrl 
        ON searchBooks(bookUrl)
      `),await e.execute(`
        CREATE INDEX IF NOT EXISTS index_searchBooks_origin 
        ON searchBooks(origin)
      `),await e.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_search_keywords_word 
        ON search_keywords(word)
      `),await e.execute(`
        CREATE INDEX IF NOT EXISTS index_bookmarks_bookName_bookAuthor 
        ON bookmarks(bookName, bookAuthor)
      `),await e.execute(`
        CREATE INDEX IF NOT EXISTS index_rssSources_sourceUrl 
        ON rssSources(sourceUrl)
      `),await e.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_caches_key 
        ON caches(key)
      `),await e.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_cookies_url 
        ON cookies(url)
      `),await e.execute(`
        CREATE INDEX IF NOT EXISTS index_replace_rules_id 
        ON replace_rules(id)
      `)}},{version:Z,up:z},{version:Te,up:ae},{version:Ee,up:oe},{version:ie,up:re},{version:se,up:Ne},{version:Le,up:ce},{version:ue,up:ne},{version:ee,up:b},{version:_e,up:Ie},{version:Re,up:le},{version:Ue,up:Ae},{version:ct,up:ut},{version:nt,up:_t},{version:dt,up:It},{version:we,up:Xe},{version:ge,up:Fe},{version:ve,up:Ge},{version:Me,up:Ye},{version:Ve,up:He},{version:Be,up:j},{version:Ke,up:Je},{version:Qe,up:ze},{version:Ze,up:et},{version:tt,up:at},{version:Tt,up:ot},{version:it,up:st},{version:Nt,up:Lt}];export{Te as CHAPTER_CACHE_SCHEMA_VERSION,Z as LEGADO_SCHEMA_VERSION,lt as migrations};

import{ensureChapterCacheSchema as m,migrateChapterCacheV97 as S,CHAPTER_CACHE_SCHEMA_VERSION as w}from"./migration-chapter-cache-v97-ggtQT808.js";const k=96;async function l(e,T){return(await e.select("SELECT name FROM sqlite_master WHERE type='table' AND name = ?",[T])).length>0}async function I(e,T,E){return await l(e,T)?(await e.select(`PRAGMA table_info(${T})`)).some(t=>t.name===E):!1}async function o(e,T,E,a){await I(e,T,E)||await e.execute(`ALTER TABLE ${T} ADD COLUMN ${E} ${a}`)}async function F(e){if(!await l(e,"readRecord")){await e.execute(`
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
    `);return}await I(e,"readRecord","bookAuthor")||(await e.execute(`
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
  `),await e.execute(`
    INSERT INTO readRecord_new (deviceId, bookName, bookAuthor, readTime, lastRead, durChapterTitle, durChapterIndex)
    SELECT deviceId, bookName, '', readTime, lastRead, '', 0 FROM readRecord
  `),await e.execute("DROP TABLE readRecord"),await e.execute("ALTER TABLE readRecord_new RENAME TO readRecord"))}async function D(e){if(!await l(e,"rssArticles")){await e.execute(`
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
    `);return}await I(e,"rssArticles","type")||(await e.execute(`
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
  `),await e.execute(`
    INSERT INTO rssArticles_new (
      origin, sort, title, "order", link, pubDate, description, content, image,
      "group", read, variable, type, durPos
    )
    SELECT
      origin, sort, title, "order", link, pubDate, description, content, image,
      "group", read, variable, 0, 0
    FROM rssArticles
  `),await e.execute("DROP TABLE rssArticles"),await e.execute("ALTER TABLE rssArticles_new RENAME TO rssArticles"))}async function g(e){if(!await l(e,"book_sources"))return;const T=await I(e,"book_sources","nextPagePreload"),E=await I(e,"book_sources","nextPageLazyLoad");if(T&&!E){await e.execute(`
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
    `),await e.execute(`
      INSERT INTO book_sources_new SELECT
        bookSourceUrl, bookSourceName, bookSourceGroup, bookSourceType, bookUrlPattern,
        customOrder, enabled, enabledExplore, jsLib, enabledCookieJar, concurrentRate,
        header, loginUrl, loginUi, loginCheckJs, coverDecodeJs, bookSourceComment,
        variableComment, lastUpdateTime, respondTime, weight, exploreUrl, exploreScreen,
        ruleExplore, searchUrl, ruleSearch, ruleBookInfo, ruleToc, ruleContent, ruleReview,
        COALESCE(eventListener, 0), COALESCE(customButton, 0), COALESCE(nextPagePreload, 0)
      FROM book_sources
    `),await e.execute("DROP TABLE book_sources"),await e.execute("ALTER TABLE book_sources_new RENAME TO book_sources"),await e.execute(`
      CREATE INDEX IF NOT EXISTS index_book_sources_bookSourceUrl
      ON book_sources(bookSourceUrl)
    `);return}await o(e,"book_sources","eventListener","INTEGER NOT NULL DEFAULT 0"),await o(e,"book_sources","customButton","INTEGER NOT NULL DEFAULT 0"),await o(e,"book_sources","nextPageLazyLoad","INTEGER NOT NULL DEFAULT 0")}async function C(e){await e.execute(`
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
  `),await e.execute(`
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
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS readRecordSession (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      deviceId TEXT NOT NULL,
      bookName TEXT NOT NULL,
      bookAuthor TEXT NOT NULL DEFAULT '',
      startTime INTEGER NOT NULL,
      endTime INTEGER NOT NULL,
      words INTEGER NOT NULL
    )
  `),await e.execute(`
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
  `),await e.execute(`
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
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS dictRules (
      name TEXT NOT NULL,
      urlRule TEXT NOT NULL,
      showRule TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sortNumber INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(name)
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS keyboardAssists (
      type INTEGER NOT NULL DEFAULT 0,
      key TEXT NOT NULL DEFAULT '',
      value TEXT NOT NULL DEFAULT '',
      serialNo INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(type, key)
    )
  `),await e.execute(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT,
      sortNumber INTEGER NOT NULL,
      PRIMARY KEY(id)
    )
  `),await e.execute(`
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
  `),await e.execute(`
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
  `),await e.execute(`
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
  `)}async function G(e){await e.execute(`
    CREATE INDEX IF NOT EXISTS index_url_records_timestamp ON url_records(timestamp)
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS index_url_records_domain ON url_records(domain)
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS index_direct_link_upload_rules_sortOrder
    ON direct_link_upload_rules(sortOrder)
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS index_direct_link_upload_rules_isDefault
    ON direct_link_upload_rules(isDefault)
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS index_upload_histories_uploadTime ON upload_histories(uploadTime)
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS index_upload_histories_ruleId ON upload_histories(ruleId)
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS index_upload_histories_success ON upload_histories(success)
  `),await e.execute(`
    CREATE INDEX IF NOT EXISTS index_rssReadRecords_origin ON rssReadRecords(origin)
  `),await e.execute("DROP VIEW IF EXISTS BookSourcePart"),await e.execute(`
    CREATE VIEW BookSourcePart AS
    SELECT bookSourceUrl, bookSourceName, bookSourceGroup, customOrder, enabled, enabledExplore,
      (loginUrl IS NOT NULL AND trim(loginUrl) <> '') AS hasLoginUrl,
      lastUpdateTime, respondTime, weight,
      (exploreUrl IS NOT NULL AND trim(exploreUrl) <> '') AS hasExploreUrl,
      eventListener, bookSourceType
    FROM book_sources
  `)}async function x(e){await o(e,"books","durVolumeIndex","INTEGER NOT NULL DEFAULT 0"),await o(e,"books","chapterInVolumeIndex","INTEGER NOT NULL DEFAULT 0"),await o(e,"book_groups","onlyUpdateRead","INTEGER NOT NULL DEFAULT 0"),await g(e),await o(e,"chapters","imgUrl","TEXT"),await o(e,"rssSources","preloadJs","TEXT"),await o(e,"rssSources","startHtml","TEXT"),await o(e,"rssSources","startStyle","TEXT"),await o(e,"rssSources","startJs","TEXT"),await o(e,"rssSources","showWebLog","INTEGER NOT NULL DEFAULT 0"),await o(e,"rssSources","type","INTEGER NOT NULL DEFAULT 0"),await o(e,"rssSources","preload","INTEGER NOT NULL DEFAULT 0"),await o(e,"rssSources","cacheFirst","INTEGER NOT NULL DEFAULT 0"),await o(e,"rssSources","searchUrl","TEXT"),await D(e),await o(e,"rssStars","type","INTEGER NOT NULL DEFAULT 0"),await o(e,"rssStars","durPos","INTEGER NOT NULL DEFAULT 0"),await o(e,"rssReadRecords","origin","TEXT NOT NULL DEFAULT ''"),await o(e,"rssReadRecords","sort","TEXT NOT NULL DEFAULT ''"),await o(e,"rssReadRecords","image","TEXT"),await o(e,"rssReadRecords","type","INTEGER NOT NULL DEFAULT 0"),await o(e,"rssReadRecords","durPos","INTEGER NOT NULL DEFAULT 0"),await o(e,"rssReadRecords","pubDate","TEXT"),await F(e),await C(e),await G(e)}const h=98;async function y(e){await m(e)}const M=99;async function f(e){await m(e),(await e.select("PRAGMA table_info(chapter_cache)")).map(a=>String(a.name??"").toLowerCase()).includes("cache_tier")||(console.log("[数据库迁移] chapter_cache 添加 cache_tier 列"),await e.execute("ALTER TABLE chapter_cache ADD COLUMN cache_tier TEXT NOT NULL DEFAULT 'auto'"))}const Y=100;async function P(e){await e.execute(`
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
  `)}const B=101;async function v(e){await e.execute(`
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
  `);const T=Date.now(),E=[{id:"default",name:"试听列表"},{id:"love",name:"我的收藏"},{id:"recent",name:"最近播放"},{id:"local",name:"本地音乐"}];for(const a of E)await e.execute(`INSERT OR IGNORE INTO audio_playlists (id, name, source, created_at, updated_at)
       VALUES (?, ?, 'builtin', ?, ?)`,[a.id,a.name,T,T])}const b=102;async function K(e){await e.execute(`
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
  `)}const u={video:4,text:8,updateError:16,audio:32,image:64,webFile:128,local:256,notShelf:1024},n={audio:1,image:2,file:3,video:4};function A(e){return Number.isInteger(e)&&e>=0&&e<=n.video}function X(e){switch(e){case n.audio:return u.audio;case n.image:return u.image;case n.video:return u.video;case n.file:return u.text|u.webFile;default:return u.text}}const V=103;async function H(e){const T=await e.select("SELECT bookUrl, type, origin FROM books"),E=await e.select("SELECT bookSourceUrl, bookSourceType FROM book_sources"),a=new Map(E.map(t=>[t.bookSourceUrl,t.bookSourceType]));for(const t of T){let L=t.type;const r=a.get(t.origin);if(A(t.type))L=X(t.type);else if(r!=null&&A(r)){const N=X(r),i=t.type&(u.updateError|u.local|u.notShelf);L=N|i}L!==t.type&&await e.execute("UPDATE books SET type = ? WHERE bookUrl = ?",[L,t.bookUrl])}}const s={Favorite:-7,Preview:-8,MusicDefault:-20,MusicRecent:-21,MusicLocal:-22,MusicUserStart:-1e3},W=104;async function d(e,T){return(await e.select("SELECT name FROM sqlite_master WHERE type='table' AND name = ?",[T])).length>0}async function J(e,T,E){return await d(e,T)?(await e.select(`PRAGMA table_info(${T})`)).some(t=>t.name===E):!1}async function O(e,T,E,a){await J(e,T,E)||await e.execute(`ALTER TABLE ${T} ADD COLUMN ${E} ${a}`)}const _={default:s.MusicDefault,recent:s.MusicRecent,local:s.MusicLocal};async function $(e){(await d(e,"media_groups")?"media_groups":"book_groups")==="book_groups"&&await e.execute("ALTER TABLE book_groups RENAME TO media_groups"),await O(e,"media_groups","domain","TEXT NOT NULL DEFAULT 'shelf'"),await O(e,"media_groups","listId","TEXT"),await O(e,"media_groups","source","TEXT"),await e.execute(`
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
  `),await e.execute("DELETE FROM media_groups WHERE groupId IN (-3, -6)");const E=Date.now();if(await e.execute(`INSERT OR IGNORE INTO media_groups
      (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
     VALUES (?, ?, ?, 0, 1, -1, 0, 'shared', NULL, NULL)`,[s.Favorite,"收藏",-4]),await e.execute(`INSERT OR IGNORE INTO media_groups
      (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
     VALUES (?, ?, ?, 0, 1, -1, 0, 'shared', NULL, NULL)`,[s.Preview,"试读/试听/试看",-3]),await d(e,"audio_playlists")){const a=await e.select("SELECT * FROM audio_playlists ORDER BY updated_at DESC");let t=s.MusicUserStart;for(const r of a){const N=String(r.id);if(N==="love")continue;let i=_[N];i==null&&(i=t,t-=1),await e.execute(`INSERT OR IGNORE INTO media_groups
          (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
         VALUES (?, ?, ?, 0, 1, -1, 0, 'music', ?, ?)`,[i,String(r.name),N==="local"?-2:N==="recent"?-1:0,N,String(r.source??"builtin")])}const L=await e.select("SELECT playlist_id, track_id, sort_order FROM audio_playlist_items ORDER BY playlist_id, sort_order");for(const r of L){const N=String(r.playlist_id),i=String(r.track_id),c=Number(r.sort_order??0);if(N==="love"){await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,[s.Favorite,i,c,E]);continue}const R=_[N];if(R==null){const U=await e.select("SELECT groupId FROM media_groups WHERE listId = ? LIMIT 1",[N]);if(!U[0])continue;await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,[U[0].groupId,i,c,E])}else await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,[R,i,c,E])}}}const j=105;async function Q(e,T){return(await e.select("SELECT name FROM sqlite_master WHERE type='table' AND name = ?",[T])).length>0}async function p(e,T){var a;return((a=(await e.select("SELECT type FROM sqlite_master WHERE name = ?",[T]))[0])==null?void 0:a.type)==="view"}async function z(e){const T=Date.now(),E=await e.select("SELECT groupId FROM media_groups WHERE groupId > 0 AND domain = 'shelf'"),a=await e.select('SELECT bookUrl, "group" AS groupMask FROM books WHERE "group" > 0');for(const L of a){const r=Number(L.groupMask??0);if(r){for(const N of E){const i=Number(N.groupId);(r&i)>0&&await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'book', ?, 0, ?)`,[i,L.bookUrl,T])}(r&s.Favorite)>0&&await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
         VALUES (?, 'book', ?, 0, ?)`,[s.Favorite,L.bookUrl,T])}}const t=E.reduce((L,r)=>L|Number(r.groupId),0);if(t>0&&await e.execute('UPDATE books SET "group" = "group" & ~? WHERE "group" > 0',[t]),await Q(e,"audio_playlist_items")&&!await p(e,"audio_playlist_items")){const r=await e.select(`SELECT api.playlist_id, api.track_id, api.sort_order
         FROM audio_playlist_items api
         LEFT JOIN media_group_items mgi
           ON mgi.item_id = api.track_id AND mgi.item_kind = 'track'
         LEFT JOIN media_groups mg ON mg.groupId = mgi.group_id AND mg.listId = api.playlist_id
         WHERE mgi.item_id IS NULL`);for(const N of r){const i=String(N.playlist_id),c=String(N.track_id),R=Number(N.sort_order??0),U=await e.select("SELECT groupId FROM media_groups WHERE listId = ? LIMIT 1",[i]);U[0]&&await e.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,[U[0].groupId,c,R,T])}await e.execute("DROP TABLE audio_playlist_items")}await p(e,"audio_playlist_items")||await e.execute(`
      CREATE VIEW IF NOT EXISTS audio_playlist_items AS
      SELECT mg.listId AS playlist_id, mgi.item_id AS track_id, mgi.sort_order
      FROM media_group_items mgi
      INNER JOIN media_groups mg ON mg.groupId = mgi.group_id AND mg.domain = 'music'
      WHERE mgi.item_kind = 'track'
    `)}const q=106;async function Z(e){await e.execute(`UPDATE media_groups
     SET groupName = '试听列表', "order" = -4
     WHERE groupId = ? AND domain = 'music'`,[s.MusicDefault]),await e.execute(`UPDATE media_groups SET groupName = '最近播放', "order" = -3 WHERE groupId = ?`,[s.MusicRecent]),await e.execute(`UPDATE media_groups SET groupName = '本地音乐', "order" = -2 WHERE groupId = ?`,[s.MusicLocal]),await e.execute("UPDATE audio_playlists SET name = '试听列表' WHERE id = 'default'"),await e.execute("UPDATE audio_playlists SET name = '我的收藏' WHERE id = 'love'")}const Te=[{version:1,up:async e=>{await e.execute(`
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
      `)}},{version:k,up:x},{version:w,up:S},{version:h,up:y},{version:M,up:f},{version:Y,up:P},{version:B,up:v},{version:b,up:K},{version:V,up:H},{version:W,up:$},{version:j,up:z},{version:q,up:Z}];export{w as CHAPTER_CACHE_SCHEMA_VERSION,k as LEGADO_SCHEMA_VERSION,Te as migrations};

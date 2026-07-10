import{ensureChapterCacheSchema as A,migrateChapterCacheV97 as X,CHAPTER_CACHE_SCHEMA_VERSION as _}from"./migration-chapter-cache-v97-ggtQT808.js";import{aF as L,aG as m,aH as p}from"./index-sWIhUgFS.js";const S=96;async function n(T,e){return(await T.select("SELECT name FROM sqlite_master WHERE type='table' AND name = ?",[e])).length>0}async function U(T,e,E){return await n(T,e)?(await T.select(`PRAGMA table_info(${e})`)).some(i=>i.name===E):!1}async function N(T,e,E,t){await U(T,e,E)||await T.execute(`ALTER TABLE ${e} ADD COLUMN ${E} ${t}`)}async function w(T){if(!await n(T,"readRecord")){await T.execute(`
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
    `);return}await U(T,"readRecord","bookAuthor")||(await T.execute(`
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
  `),await T.execute(`
    INSERT INTO readRecord_new (deviceId, bookName, bookAuthor, readTime, lastRead, durChapterTitle, durChapterIndex)
    SELECT deviceId, bookName, '', readTime, lastRead, '', 0 FROM readRecord
  `),await T.execute("DROP TABLE readRecord"),await T.execute("ALTER TABLE readRecord_new RENAME TO readRecord"))}async function F(T){if(!await n(T,"rssArticles")){await T.execute(`
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
    `);return}await U(T,"rssArticles","type")||(await T.execute(`
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
  `),await T.execute(`
    INSERT INTO rssArticles_new (
      origin, sort, title, "order", link, pubDate, description, content, image,
      "group", read, variable, type, durPos
    )
    SELECT
      origin, sort, title, "order", link, pubDate, description, content, image,
      "group", read, variable, 0, 0
    FROM rssArticles
  `),await T.execute("DROP TABLE rssArticles"),await T.execute("ALTER TABLE rssArticles_new RENAME TO rssArticles"))}async function k(T){if(!await n(T,"book_sources"))return;const e=await U(T,"book_sources","nextPagePreload"),E=await U(T,"book_sources","nextPageLazyLoad");if(e&&!E){await T.execute(`
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
    `),await T.execute(`
      INSERT INTO book_sources_new SELECT
        bookSourceUrl, bookSourceName, bookSourceGroup, bookSourceType, bookUrlPattern,
        customOrder, enabled, enabledExplore, jsLib, enabledCookieJar, concurrentRate,
        header, loginUrl, loginUi, loginCheckJs, coverDecodeJs, bookSourceComment,
        variableComment, lastUpdateTime, respondTime, weight, exploreUrl, exploreScreen,
        ruleExplore, searchUrl, ruleSearch, ruleBookInfo, ruleToc, ruleContent, ruleReview,
        COALESCE(eventListener, 0), COALESCE(customButton, 0), COALESCE(nextPagePreload, 0)
      FROM book_sources
    `),await T.execute("DROP TABLE book_sources"),await T.execute("ALTER TABLE book_sources_new RENAME TO book_sources"),await T.execute(`
      CREATE INDEX IF NOT EXISTS index_book_sources_bookSourceUrl
      ON book_sources(bookSourceUrl)
    `);return}await N(T,"book_sources","eventListener","INTEGER NOT NULL DEFAULT 0"),await N(T,"book_sources","customButton","INTEGER NOT NULL DEFAULT 0"),await N(T,"book_sources","nextPageLazyLoad","INTEGER NOT NULL DEFAULT 0")}async function D(T){await T.execute(`
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
  `),await T.execute(`
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
  `),await T.execute(`
    CREATE TABLE IF NOT EXISTS readRecordSession (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      deviceId TEXT NOT NULL,
      bookName TEXT NOT NULL,
      bookAuthor TEXT NOT NULL DEFAULT '',
      startTime INTEGER NOT NULL,
      endTime INTEGER NOT NULL,
      words INTEGER NOT NULL
    )
  `),await T.execute(`
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
  `),await T.execute(`
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
  `),await T.execute(`
    CREATE TABLE IF NOT EXISTS dictRules (
      name TEXT NOT NULL,
      urlRule TEXT NOT NULL,
      showRule TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sortNumber INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(name)
    )
  `),await T.execute(`
    CREATE TABLE IF NOT EXISTS keyboardAssists (
      type INTEGER NOT NULL DEFAULT 0,
      key TEXT NOT NULL DEFAULT '',
      value TEXT NOT NULL DEFAULT '',
      serialNo INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(type, key)
    )
  `),await T.execute(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT,
      sortNumber INTEGER NOT NULL,
      PRIMARY KEY(id)
    )
  `),await T.execute(`
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
  `),await T.execute(`
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
  `),await T.execute(`
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
  `)}async function g(T){await T.execute(`
    CREATE INDEX IF NOT EXISTS index_url_records_timestamp ON url_records(timestamp)
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS index_url_records_domain ON url_records(domain)
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS index_direct_link_upload_rules_sortOrder
    ON direct_link_upload_rules(sortOrder)
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS index_direct_link_upload_rules_isDefault
    ON direct_link_upload_rules(isDefault)
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS index_upload_histories_uploadTime ON upload_histories(uploadTime)
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS index_upload_histories_ruleId ON upload_histories(ruleId)
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS index_upload_histories_success ON upload_histories(success)
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS index_rssReadRecords_origin ON rssReadRecords(origin)
  `),await T.execute("DROP VIEW IF EXISTS BookSourcePart"),await T.execute(`
    CREATE VIEW BookSourcePart AS
    SELECT bookSourceUrl, bookSourceName, bookSourceGroup, customOrder, enabled, enabledExplore,
      (loginUrl IS NOT NULL AND trim(loginUrl) <> '') AS hasLoginUrl,
      lastUpdateTime, respondTime, weight,
      (exploreUrl IS NOT NULL AND trim(exploreUrl) <> '') AS hasExploreUrl,
      eventListener, bookSourceType
    FROM book_sources
  `)}async function G(T){await N(T,"books","durVolumeIndex","INTEGER NOT NULL DEFAULT 0"),await N(T,"books","chapterInVolumeIndex","INTEGER NOT NULL DEFAULT 0"),await N(T,"book_groups","onlyUpdateRead","INTEGER NOT NULL DEFAULT 0"),await k(T),await N(T,"chapters","imgUrl","TEXT"),await N(T,"rssSources","preloadJs","TEXT"),await N(T,"rssSources","startHtml","TEXT"),await N(T,"rssSources","startStyle","TEXT"),await N(T,"rssSources","startJs","TEXT"),await N(T,"rssSources","showWebLog","INTEGER NOT NULL DEFAULT 0"),await N(T,"rssSources","type","INTEGER NOT NULL DEFAULT 0"),await N(T,"rssSources","preload","INTEGER NOT NULL DEFAULT 0"),await N(T,"rssSources","cacheFirst","INTEGER NOT NULL DEFAULT 0"),await N(T,"rssSources","searchUrl","TEXT"),await F(T),await N(T,"rssStars","type","INTEGER NOT NULL DEFAULT 0"),await N(T,"rssStars","durPos","INTEGER NOT NULL DEFAULT 0"),await N(T,"rssReadRecords","origin","TEXT NOT NULL DEFAULT ''"),await N(T,"rssReadRecords","sort","TEXT NOT NULL DEFAULT ''"),await N(T,"rssReadRecords","image","TEXT"),await N(T,"rssReadRecords","type","INTEGER NOT NULL DEFAULT 0"),await N(T,"rssReadRecords","durPos","INTEGER NOT NULL DEFAULT 0"),await N(T,"rssReadRecords","pubDate","TEXT"),await w(T),await D(T),await g(T)}const C=98;async function x(T){await A(T)}const h=99;async function y(T){await A(T),(await T.select("PRAGMA table_info(chapter_cache)")).map(t=>String(t.name??"").toLowerCase()).includes("cache_tier")||(console.log("[数据库迁移] chapter_cache 添加 cache_tier 列"),await T.execute("ALTER TABLE chapter_cache ADD COLUMN cache_tier TEXT NOT NULL DEFAULT 'auto'"))}const M=100;async function f(T){await T.execute(`
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
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS index_theme_presets_kind
    ON theme_presets(kind)
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS index_theme_presets_updated
    ON theme_presets(updated_at DESC)
  `)}const Y=101;async function P(T){await T.execute(`
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
  `),await T.execute(`
    CREATE TABLE IF NOT EXISTS audio_playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'builtin',
      description TEXT,
      cover_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `),await T.execute(`
    CREATE TABLE IF NOT EXISTS audio_playlist_items (
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (playlist_id, track_id)
    )
  `),await T.execute(`
    CREATE TABLE IF NOT EXISTS audio_url_cache (
      track_id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `),await T.execute(`
    CREATE TABLE IF NOT EXISTS audio_auth_sessions (
      platform TEXT PRIMARY KEY,
      cookies TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      healthy INTEGER NOT NULL DEFAULT 0
    )
  `),await T.execute(`
    CREATE TABLE IF NOT EXISTS audio_sync_state (
      id TEXT PRIMARY KEY DEFAULT 'default',
      server_url TEXT NOT NULL DEFAULT '',
      server_id TEXT NOT NULL DEFAULT '',
      sync_mode TEXT NOT NULL DEFAULT 'merge_local_remote',
      last_sync_at INTEGER NOT NULL DEFAULT 0,
      connected INTEGER NOT NULL DEFAULT 0
    )
  `),await T.execute(`
    CREATE TABLE IF NOT EXISTS audio_dislike_rules (
      id TEXT PRIMARY KEY,
      rule_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS index_audio_tracks_source ON audio_tracks(source)
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS index_audio_playlist_items_playlist ON audio_playlist_items(playlist_id, sort_order)
  `);const e=Date.now(),E=[{id:"default",name:"默认列表"},{id:"love",name:"我喜欢"},{id:"recent",name:"最近播放"},{id:"local",name:"本地音乐"}];for(const t of E)await T.execute(`INSERT OR IGNORE INTO audio_playlists (id, name, source, created_at, updated_at)
       VALUES (?, ?, 'builtin', ?, ?)`,[t.id,t.name,e,e])}const B=102;async function v(T){await T.execute(`
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
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS index_audio_download_tasks_status ON audio_download_tasks(status)
  `)}const b=104;async function O(T,e){return(await T.select("SELECT name FROM sqlite_master WHERE type='table' AND name = ?",[e])).length>0}async function K(T,e,E){return await O(T,e)?(await T.select(`PRAGMA table_info(${e})`)).some(i=>i.name===E):!1}async function R(T,e,E,t){await K(T,e,E)||await T.execute(`ALTER TABLE ${e} ADD COLUMN ${E} ${t}`)}const l={default:L.MusicDefault,recent:L.MusicRecent,local:L.MusicLocal};async function V(T){(await O(T,"media_groups")?"media_groups":"book_groups")==="book_groups"&&await T.execute("ALTER TABLE book_groups RENAME TO media_groups"),await R(T,"media_groups","domain","TEXT NOT NULL DEFAULT 'shelf'"),await R(T,"media_groups","listId","TEXT"),await R(T,"media_groups","source","TEXT"),await T.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS index_media_groups_listId
    ON media_groups(listId) WHERE listId IS NOT NULL
  `),await T.execute(`
    CREATE TABLE IF NOT EXISTS media_group_items (
      group_id INTEGER NOT NULL,
      item_kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, item_kind, item_id)
    )
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS idx_mgi_group ON media_group_items(group_id, sort_order)
  `),await T.execute(`
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
  `),await T.execute(`
    CREATE INDEX IF NOT EXISTS idx_mpi_kind ON media_preview_items(media_kind, last_opened_at DESC)
  `),await T.execute("DELETE FROM media_groups WHERE groupId IN (-3, -6)");const E=Date.now();if(await T.execute(`INSERT OR IGNORE INTO media_groups
      (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
     VALUES (?, ?, ?, 0, 1, -1, 0, 'shared', NULL, NULL)`,[L.Favorite,"收藏",-4]),await T.execute(`INSERT OR IGNORE INTO media_groups
      (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
     VALUES (?, ?, ?, 0, 1, -1, 0, 'shared', NULL, NULL)`,[L.Preview,"试读/试听/试看",-3]),await O(T,"audio_playlists")){const t=await T.select("SELECT * FROM audio_playlists ORDER BY updated_at DESC");let i=L.MusicUserStart;for(const o of t){const a=String(o.id);if(a==="love")continue;let r=l[a];r==null&&(r=i,i-=1),await T.execute(`INSERT OR IGNORE INTO media_groups
          (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
         VALUES (?, ?, ?, 0, 1, -1, 0, 'music', ?, ?)`,[r,String(o.name),a==="local"?-2:a==="recent"?-1:0,a,String(o.source??"builtin")])}const s=await T.select("SELECT playlist_id, track_id, sort_order FROM audio_playlist_items ORDER BY playlist_id, sort_order");for(const o of s){const a=String(o.playlist_id),r=String(o.track_id),c=Number(o.sort_order??0);if(a==="love"){await T.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,[L.Favorite,r,c,E]);continue}const I=l[a];if(I==null){const u=await T.select("SELECT groupId FROM media_groups WHERE listId = ? LIMIT 1",[a]);if(!u[0])continue;await T.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,[u[0].groupId,r,c,E])}else await T.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,[I,r,c,E])}}}const H=105;async function W(T,e){return(await T.select("SELECT name FROM sqlite_master WHERE type='table' AND name = ?",[e])).length>0}async function d(T,e){var t;return((t=(await T.select("SELECT type FROM sqlite_master WHERE name = ?",[e]))[0])==null?void 0:t.type)==="view"}async function J(T){const e=Date.now(),E=await T.select("SELECT groupId FROM media_groups WHERE groupId > 0 AND domain = 'shelf'"),t=await T.select('SELECT bookUrl, "group" AS groupMask FROM books WHERE "group" > 0');for(const s of t){const o=Number(s.groupMask??0);if(o){for(const a of E){const r=Number(a.groupId);(o&r)>0&&await T.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'book', ?, 0, ?)`,[r,s.bookUrl,e])}(o&L.Favorite)>0&&await T.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
         VALUES (?, 'book', ?, 0, ?)`,[L.Favorite,s.bookUrl,e])}}const i=E.reduce((s,o)=>s|Number(o.groupId),0);if(i>0&&await T.execute('UPDATE books SET "group" = "group" & ~? WHERE "group" > 0',[i]),await W(T,"audio_playlist_items")&&!await d(T,"audio_playlist_items")){const o=await T.select(`SELECT api.playlist_id, api.track_id, api.sort_order
         FROM audio_playlist_items api
         LEFT JOIN media_group_items mgi
           ON mgi.item_id = api.track_id AND mgi.item_kind = 'track'
         LEFT JOIN media_groups mg ON mg.groupId = mgi.group_id AND mg.listId = api.playlist_id
         WHERE mgi.item_id IS NULL`);for(const a of o){const r=String(a.playlist_id),c=String(a.track_id),I=Number(a.sort_order??0),u=await T.select("SELECT groupId FROM media_groups WHERE listId = ? LIMIT 1",[r]);u[0]&&await T.execute(`INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,[u[0].groupId,c,I,e])}await T.execute("DROP TABLE audio_playlist_items")}await d(T,"audio_playlist_items")||await T.execute(`
      CREATE VIEW IF NOT EXISTS audio_playlist_items AS
      SELECT mg.listId AS playlist_id, mgi.item_id AS track_id, mgi.sort_order
      FROM media_group_items mgi
      INNER JOIN media_groups mg ON mg.groupId = mgi.group_id AND mg.domain = 'music'
      WHERE mgi.item_kind = 'track'
    `)}const Q=[{version:1,up:async T=>{await T.execute(`
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
      `),await T.execute(`
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
      `),await T.execute(`
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
      `),await T.execute(`
        CREATE TABLE IF NOT EXISTS chapter_cache (
          book_url TEXT NOT NULL,
          chapter_index INTEGER NOT NULL,
          content TEXT,
          file_path TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY(book_url, chapter_index)
        )
      `),await T.execute(`
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
      `),await T.execute(`
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
      `),await T.execute(`
        CREATE TABLE IF NOT EXISTS search_keywords (
          word TEXT NOT NULL,
          usage INTEGER NOT NULL,
          lastUseTime INTEGER NOT NULL,
          PRIMARY KEY(word)
        )
      `),await T.execute(`
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
      `),await T.execute(`
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
      `),await T.execute(`
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
      `),await T.execute(`
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
      `),await T.execute(`
        CREATE TABLE IF NOT EXISTS rssReadRecords (
          record TEXT NOT NULL,
          title TEXT,
          readTime INTEGER,
          read INTEGER NOT NULL,
          PRIMARY KEY(record)
        )
      `),await T.execute(`
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
      `),await T.execute(`
        CREATE TABLE IF NOT EXISTS readRecord (
          deviceId TEXT NOT NULL,
          bookName TEXT NOT NULL,
          readTime INTEGER NOT NULL DEFAULT 0,
          lastRead INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(deviceId, bookName)
        )
      `),await T.execute(`
        CREATE TABLE IF NOT EXISTS cookies (
          url TEXT NOT NULL,
          cookie TEXT NOT NULL,
          PRIMARY KEY(url)
        )
      `),await T.execute(`
        CREATE TABLE IF NOT EXISTS caches (
          key TEXT NOT NULL,
          value TEXT,
          deadline INTEGER NOT NULL,
          PRIMARY KEY(key)
        )
      `),await T.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_books_name_author 
        ON books(name, author)
      `),await T.execute(`
        CREATE INDEX IF NOT EXISTS index_chapters_bookUrl 
        ON chapters(bookUrl)
      `),await T.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_chapters_bookUrl_index 
        ON chapters(bookUrl, "index")
      `),await T.execute(`
        CREATE INDEX IF NOT EXISTS index_book_sources_bookSourceUrl 
        ON book_sources(bookSourceUrl)
      `),await T.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_searchBooks_bookUrl 
        ON searchBooks(bookUrl)
      `),await T.execute(`
        CREATE INDEX IF NOT EXISTS index_searchBooks_origin 
        ON searchBooks(origin)
      `),await T.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_search_keywords_word 
        ON search_keywords(word)
      `),await T.execute(`
        CREATE INDEX IF NOT EXISTS index_bookmarks_bookName_bookAuthor 
        ON bookmarks(bookName, bookAuthor)
      `),await T.execute(`
        CREATE INDEX IF NOT EXISTS index_rssSources_sourceUrl 
        ON rssSources(sourceUrl)
      `),await T.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_caches_key 
        ON caches(key)
      `),await T.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS index_cookies_url 
        ON cookies(url)
      `),await T.execute(`
        CREATE INDEX IF NOT EXISTS index_replace_rules_id 
        ON replace_rules(id)
      `)}},{version:S,up:G},{version:_,up:X},{version:C,up:x},{version:h,up:y},{version:M,up:f},{version:Y,up:P},{version:B,up:v},{version:p,up:m},{version:b,up:V},{version:H,up:J}];export{_ as CHAPTER_CACHE_SCHEMA_VERSION,S as LEGADO_SCHEMA_VERSION,Q as migrations};

const R=96;async function o(T,E){return(await T.select("SELECT name FROM sqlite_master WHERE type='table' AND name = ?",[E])).length>0}async function r(T,E,N){return await o(T,E)?(await T.select(`PRAGMA table_info(${E})`)).some(a=>a.name===N):!1}async function e(T,E,N,L){await r(T,E,N)||await T.execute(`ALTER TABLE ${E} ADD COLUMN ${N} ${L}`)}async function t(T){if(!await o(T,"readRecord")){await T.execute(`
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
    `);return}await r(T,"readRecord","bookAuthor")||(await T.execute(`
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
  `),await T.execute("DROP TABLE readRecord"),await T.execute("ALTER TABLE readRecord_new RENAME TO readRecord"))}async function i(T){if(!await o(T,"rssArticles")){await T.execute(`
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
    `);return}await r(T,"rssArticles","type")||(await T.execute(`
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
  `),await T.execute("DROP TABLE rssArticles"),await T.execute("ALTER TABLE rssArticles_new RENAME TO rssArticles"))}async function U(T){if(!await o(T,"book_sources"))return;const E=await r(T,"book_sources","nextPagePreload"),N=await r(T,"book_sources","nextPageLazyLoad");if(E&&!N){await T.execute(`
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
    `);return}await e(T,"book_sources","eventListener","INTEGER NOT NULL DEFAULT 0"),await e(T,"book_sources","customButton","INTEGER NOT NULL DEFAULT 0"),await e(T,"book_sources","nextPageLazyLoad","INTEGER NOT NULL DEFAULT 0")}async function s(T){await T.execute(`
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
  `)}async function I(T){await T.execute(`
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
  `)}async function O(T){await e(T,"books","durVolumeIndex","INTEGER NOT NULL DEFAULT 0"),await e(T,"books","chapterInVolumeIndex","INTEGER NOT NULL DEFAULT 0"),await e(T,"book_groups","onlyUpdateRead","INTEGER NOT NULL DEFAULT 0"),await U(T),await e(T,"chapters","imgUrl","TEXT"),await e(T,"rssSources","preloadJs","TEXT"),await e(T,"rssSources","startHtml","TEXT"),await e(T,"rssSources","startStyle","TEXT"),await e(T,"rssSources","startJs","TEXT"),await e(T,"rssSources","showWebLog","INTEGER NOT NULL DEFAULT 0"),await e(T,"rssSources","type","INTEGER NOT NULL DEFAULT 0"),await e(T,"rssSources","preload","INTEGER NOT NULL DEFAULT 0"),await e(T,"rssSources","cacheFirst","INTEGER NOT NULL DEFAULT 0"),await e(T,"rssSources","searchUrl","TEXT"),await i(T),await e(T,"rssStars","type","INTEGER NOT NULL DEFAULT 0"),await e(T,"rssStars","durPos","INTEGER NOT NULL DEFAULT 0"),await e(T,"rssReadRecords","origin","TEXT NOT NULL DEFAULT ''"),await e(T,"rssReadRecords","sort","TEXT NOT NULL DEFAULT ''"),await e(T,"rssReadRecords","image","TEXT"),await e(T,"rssReadRecords","type","INTEGER NOT NULL DEFAULT 0"),await e(T,"rssReadRecords","durPos","INTEGER NOT NULL DEFAULT 0"),await e(T,"rssReadRecords","pubDate","TEXT"),await t(T),await s(T),await I(T)}const c=[{version:1,up:async T=>{await T.execute(`
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
      `)}},{version:96,up:O}];export{R as LEGADO_SCHEMA_VERSION,c as migrations};

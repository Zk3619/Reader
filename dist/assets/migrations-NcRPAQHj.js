const E=[{version:1,up:async T=>{await T.execute(`
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
      `)}}];export{E as migrations};

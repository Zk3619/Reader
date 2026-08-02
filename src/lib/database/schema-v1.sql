-- MediaBox schema baseline v1 (squashed from former migration chain through v129).
-- Source: fully-migrated mediabox.db export. Re-export before first public release if schema drifts.
-- Excludes schema_version (owned by runMigrations) and known migration leftovers.

CREATE TABLE IF NOT EXISTS audio_auth_sessions (
      platform TEXT PRIMARY KEY,
      cookies TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      healthy INTEGER NOT NULL DEFAULT 0
    );

CREATE TABLE IF NOT EXISTS audio_dislike_rules (
      id TEXT PRIMARY KEY,
      rule_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

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
    , quality TEXT NOT NULL DEFAULT '', ext TEXT NOT NULL DEFAULT 'mp3', file_name TEXT NOT NULL DEFAULT '', progress_downloaded INTEGER NOT NULL DEFAULT 0, progress_total INTEGER NOT NULL DEFAULT 0, status_text TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, resolved_source TEXT NOT NULL DEFAULT '', task_meta TEXT NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS audio_group_items (
      group_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, item_id)
    );

CREATE TABLE IF NOT EXISTS audio_groups (
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
    );

CREATE TABLE IF NOT EXISTS audio_lyric_cache (
      track_id TEXT PRIMARY KEY NOT NULL,
      lyric_json TEXT NOT NULL,
      has_lx INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS "audio_playback_state" (
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
    );

CREATE TABLE IF NOT EXISTS audio_search_keywords (
      word TEXT NOT NULL PRIMARY KEY,
      usage INTEGER NOT NULL DEFAULT 1,
      lastUseTime INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS audio_sources (
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
    );

CREATE TABLE IF NOT EXISTS audio_sync_state (
      id TEXT PRIMARY KEY DEFAULT 'default',
      server_url TEXT NOT NULL DEFAULT '',
      server_id TEXT NOT NULL DEFAULT '',
      sync_mode TEXT NOT NULL DEFAULT 'merge_local_remote',
      last_sync_at INTEGER NOT NULL DEFAULT 0,
      connected INTEGER NOT NULL DEFAULT 0
    );

CREATE TABLE IF NOT EXISTS audio_tracks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'local',
      duration TEXT NOT NULL DEFAULT '00:00',
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    , cache_path TEXT, cache_tier TEXT, cached_at INTEGER, cache_bytes INTEGER, cache_mime TEXT, cache_quality TEXT);

CREATE TABLE IF NOT EXISTS audio_url_cache (
      track_id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS download_extensions (
      identity TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

CREATE TABLE IF NOT EXISTS download_tasks (
      id TEXT PRIMARY KEY NOT NULL,
      engine TEXT NOT NULL DEFAULT 'gopeed',
      url TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'ready',
      percent REAL NOT NULL DEFAULT 0,
      speed INTEGER NOT NULL DEFAULT 0,
      eta INTEGER NOT NULL DEFAULT -1,
      downloaded INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      filepath TEXT NOT NULL DEFAULT '',
      error TEXT,
      meta TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

CREATE TABLE IF NOT EXISTS reader_book_group_items (
      group_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, item_id)
    );

CREATE TABLE IF NOT EXISTS reader_book_groups (
      groupId INTEGER PRIMARY KEY,
      groupName TEXT NOT NULL,
      cover TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      enableRefresh INTEGER NOT NULL DEFAULT 1,
      show INTEGER NOT NULL DEFAULT 1,
      bookSort INTEGER NOT NULL DEFAULT -1,
      onlyUpdateRead INTEGER NOT NULL DEFAULT 0
    );

CREATE TABLE IF NOT EXISTS "reader_book_sources" (
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
          ruleReview TEXT, eventListener INTEGER NOT NULL DEFAULT 0, customButton INTEGER NOT NULL DEFAULT 0, nextPageLazyLoad INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(bookSourceUrl)
        );

CREATE TABLE IF NOT EXISTS "reader_bookmarks" (
          time INTEGER NOT NULL,
          bookName TEXT NOT NULL,
          bookAuthor TEXT NOT NULL,
          chapterIndex INTEGER NOT NULL,
          chapterPos INTEGER NOT NULL,
          chapterName TEXT NOT NULL,
          bookText TEXT NOT NULL,
          content TEXT NOT NULL,
          PRIMARY KEY(time)
        );

CREATE TABLE IF NOT EXISTS "reader_books" (
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
          syncTime INTEGER NOT NULL DEFAULT 0, durVolumeIndex INTEGER NOT NULL DEFAULT 0, chapterInVolumeIndex INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(bookUrl)
        );

CREATE TABLE IF NOT EXISTS reader_chapter_cache (
        book_url TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        content TEXT,
        file_path TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        cache_tier TEXT NOT NULL DEFAULT 'auto',
        PRIMARY KEY(book_url, chapter_index)
      );

CREATE TABLE IF NOT EXISTS "reader_chapters" (
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
          variable TEXT, imgUrl TEXT,
          PRIMARY KEY(url, bookUrl),
          FOREIGN KEY(bookUrl) REFERENCES "reader_books"(bookUrl) ON DELETE CASCADE
        );

CREATE TABLE IF NOT EXISTS "reader_dict_rules" (
      name TEXT NOT NULL,
      urlRule TEXT NOT NULL,
      showRule TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sortNumber INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(name)
    );

CREATE TABLE IF NOT EXISTS "reader_http_tts" (
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
    );

CREATE TABLE IF NOT EXISTS "reader_keyboard_assists" (
      type INTEGER NOT NULL DEFAULT 0,
      key TEXT NOT NULL DEFAULT '',
      value TEXT NOT NULL DEFAULT '',
      serialNo INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(type, key)
    );

CREATE TABLE IF NOT EXISTS "reader_read_record" (
        deviceId TEXT NOT NULL,
        bookName TEXT NOT NULL,
        bookAuthor TEXT NOT NULL DEFAULT '',
        readTime INTEGER NOT NULL DEFAULT 0,
        lastRead INTEGER NOT NULL DEFAULT 0,
        durChapterTitle TEXT NOT NULL DEFAULT '',
        durChapterIndex INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(deviceId, bookName, bookAuthor)
      );

CREATE TABLE IF NOT EXISTS "reader_read_record_detail" (
      deviceId TEXT NOT NULL,
      bookName TEXT NOT NULL,
      bookAuthor TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      readTime INTEGER NOT NULL DEFAULT 0,
      readWords INTEGER NOT NULL DEFAULT 0,
      firstReadTime INTEGER NOT NULL DEFAULT 0,
      lastReadTime INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(deviceId, bookName, bookAuthor, date)
    );

CREATE TABLE IF NOT EXISTS "reader_read_record_session" (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      deviceId TEXT NOT NULL,
      bookName TEXT NOT NULL,
      bookAuthor TEXT NOT NULL DEFAULT '',
      startTime INTEGER NOT NULL,
      endTime INTEGER NOT NULL,
      words INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS "reader_replace_rules" (
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
        );

CREATE TABLE IF NOT EXISTS "reader_rss_articles" (
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
      );

CREATE TABLE IF NOT EXISTS "reader_rss_read_records" (
          record TEXT NOT NULL,
          title TEXT,
          readTime INTEGER,
          read INTEGER NOT NULL, origin TEXT NOT NULL DEFAULT '', sort TEXT NOT NULL DEFAULT '', image TEXT, type INTEGER NOT NULL DEFAULT 0, durPos INTEGER NOT NULL DEFAULT 0, pubDate TEXT,
          PRIMARY KEY(record)
        );

CREATE TABLE IF NOT EXISTS "reader_rss_sources" (
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
          customOrder INTEGER NOT NULL DEFAULT 0, preloadJs TEXT, startHtml TEXT, startStyle TEXT, startJs TEXT, showWebLog INTEGER NOT NULL DEFAULT 0, type INTEGER NOT NULL DEFAULT 0, preload INTEGER NOT NULL DEFAULT 0, cacheFirst INTEGER NOT NULL DEFAULT 0, searchUrl TEXT,
          PRIMARY KEY(sourceUrl)
        );

CREATE TABLE IF NOT EXISTS "reader_rss_stars" (
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
          variable TEXT, type INTEGER NOT NULL DEFAULT 0, durPos INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(origin, link)
        );

CREATE TABLE IF NOT EXISTS "reader_rule_subs" (
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
    );

CREATE TABLE IF NOT EXISTS "reader_search_books" (
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
          FOREIGN KEY(origin) REFERENCES "reader_book_sources"(bookSourceUrl) ON DELETE CASCADE
        );

CREATE TABLE IF NOT EXISTS "reader_search_keywords" (
          word TEXT NOT NULL,
          usage INTEGER NOT NULL,
          lastUseTime INTEGER NOT NULL,
          PRIMARY KEY(word)
        );

CREATE TABLE IF NOT EXISTS "reader_txt_toc_rules" (
      id INTEGER NOT NULL,
      name TEXT NOT NULL,
      rule TEXT NOT NULL,
      replacement TEXT NOT NULL DEFAULT '',
      example TEXT,
      serialNumber INTEGER NOT NULL,
      enable INTEGER NOT NULL,
      PRIMARY KEY(id)
    );

CREATE TABLE IF NOT EXISTS schema_modules (
      module TEXT PRIMARY KEY,
      version INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS "shell_caches" (
          key TEXT NOT NULL,
          value TEXT,
          deadline INTEGER NOT NULL,
          PRIMARY KEY(key)
        );

CREATE TABLE IF NOT EXISTS "shell_cookies" (
          url TEXT NOT NULL,
          cookie TEXT NOT NULL,
          PRIMARY KEY(url)
        );

CREATE TABLE IF NOT EXISTS shell_favorites (
      item_kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (item_kind, item_id)
    );

CREATE TABLE IF NOT EXISTS shell_preview_items (
      id TEXT PRIMARY KEY,
      media_kind TEXT NOT NULL,
      title TEXT,
      author TEXT,
      cover_url TEXT,
      ref_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_opened_at INTEGER
    );

CREATE TABLE IF NOT EXISTS "shell_servers" (
      id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT,
      sortNumber INTEGER NOT NULL,
      PRIMARY KEY(id)
    );

CREATE TABLE IF NOT EXISTS "shell_theme_presets" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'user',
      scopes_app INTEGER NOT NULL DEFAULT 1,
      scopes_viewer INTEGER NOT NULL DEFAULT 1,
      manifest_json TEXT NOT NULL,
      thumbnail_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS sub_entries (
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
    );

CREATE TABLE IF NOT EXISTS sub_feeds (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      feed_url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      site_url TEXT,
      description TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS sub_search_keywords (
      word TEXT NOT NULL PRIMARY KEY,
      usage INTEGER NOT NULL DEFAULT 1,
      lastUseTime INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS sub_sources (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'opml',
      title TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fetch_at INTEGER,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    , category TEXT NOT NULL DEFAULT '', view INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS video_bangumi_prefs (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL DEFAULT 'null'
    );

CREATE TABLE IF NOT EXISTS video_bangumi_rule_subs (
      url TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fetch_at INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    );

CREATE TABLE IF NOT EXISTS video_bangumi_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      payload_json TEXT NOT NULL DEFAULT '{}',
      kazumi_api TEXT,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

CREATE TABLE IF NOT EXISTS video_bangumi_subjects (
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
    );

CREATE TABLE IF NOT EXISTS video_danmaku_cache (
      vod_key TEXT NOT NULL,
      episode INTEGER NOT NULL,
      search_title TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      file_path TEXT,
      cache_bytes INTEGER NOT NULL DEFAULT 0,
      cache_tier TEXT NOT NULL DEFAULT 'auto',
      cached_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (vod_key, episode)
    );

CREATE TABLE IF NOT EXISTS video_danmaku_override (
      vod_key TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      episode_no INTEGER,
      skip_clean INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

CREATE TABLE IF NOT EXISTS video_episode_cache (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      episode_url TEXT NOT NULL DEFAULT '',
      media_url TEXT NOT NULL DEFAULT '',
      bgm_id INTEGER,
      cache_path TEXT,
      cache_tier TEXT NOT NULL DEFAULT 'auto',
      cached_at INTEGER NOT NULL DEFAULT 0,
      cache_bytes INTEGER NOT NULL DEFAULT 0,
      cache_mime TEXT,
      local_path TEXT,
      is_hls INTEGER NOT NULL DEFAULT 0,
      has_media INTEGER NOT NULL DEFAULT 0
    );

CREATE TABLE IF NOT EXISTS video_group_items (
          group_id INTEGER NOT NULL,
          item_id TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (group_id, item_id)
        );

CREATE TABLE IF NOT EXISTS video_groups (
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
        );

CREATE TABLE IF NOT EXISTS video_play_record (
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
      );

CREATE TABLE IF NOT EXISTS video_search_keywords (
      word TEXT NOT NULL PRIMARY KEY,
      usage INTEGER NOT NULL DEFAULT 1,
      lastUseTime INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS "video_site_pref" (
      key TEXT PRIMARY KEY NOT NULL,
      searchable INTEGER NOT NULL DEFAULT 1,
      changeable INTEGER NOT NULL DEFAULT 1
    );

CREATE TABLE IF NOT EXISTS video_sources (
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
    );

CREATE TABLE IF NOT EXISTS video_tracks (
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
        , library INTEGER NOT NULL DEFAULT 0, library_order INTEGER NOT NULL DEFAULT 0);

CREATE INDEX IF NOT EXISTS idx_agi_group ON audio_group_items(group_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_download_extensions_updated ON download_extensions(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_download_tasks_state ON download_tasks(state);

CREATE INDEX IF NOT EXISTS idx_download_tasks_updated ON download_tasks(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_rbgi_group ON reader_book_group_items(group_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_shell_preview_kind
     ON shell_preview_items(media_kind, last_opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_entries_feed ON sub_entries(feed_id, published_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_entries_feed_url_unique ON sub_entries(feed_id, url) WHERE url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sub_entries_read_pub ON sub_entries(read, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_entries_starred_pub ON sub_entries(starred, published_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_feeds_feed_url_unique ON sub_feeds(feed_url);

CREATE INDEX IF NOT EXISTS idx_sub_feeds_source ON sub_feeds(source_id);

CREATE INDEX IF NOT EXISTS idx_sub_sources_category ON sub_sources(category);

CREATE INDEX IF NOT EXISTS idx_sub_sources_category_sort ON sub_sources(category, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_sources_url_unique ON sub_sources(url);

CREATE INDEX IF NOT EXISTS idx_sub_sources_view ON sub_sources(view);

CREATE INDEX IF NOT EXISTS idx_vgi_group ON video_group_items(group_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_video_bangumi_rules_enabled
     ON video_bangumi_rules(enabled, name);

CREATE INDEX IF NOT EXISTS idx_video_bangumi_subjects_fetched
     ON video_bangumi_subjects(fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_danmaku_cache_cached_at ON video_danmaku_cache(cached_at);

CREATE INDEX IF NOT EXISTS idx_video_danmaku_cache_tier ON video_danmaku_cache(cache_tier);

CREATE INDEX IF NOT EXISTS idx_video_episode_cache_cached_at ON video_episode_cache(cached_at);

CREATE INDEX IF NOT EXISTS idx_video_episode_cache_tier ON video_episode_cache(cache_tier);

CREATE INDEX IF NOT EXISTS idx_video_play_record_updated
       ON video_play_record(updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_sources_script_url
    ON video_sources(script_url)
    WHERE script_url IS NOT NULL AND script_url != '';

CREATE INDEX IF NOT EXISTS idx_video_tracks_updated
         ON video_tracks(updated_at DESC);

CREATE INDEX IF NOT EXISTS index_audio_download_tasks_status ON audio_download_tasks(status);

CREATE UNIQUE INDEX IF NOT EXISTS index_audio_groups_listId
     ON audio_groups(listId) WHERE listId IS NOT NULL;

CREATE INDEX IF NOT EXISTS index_audio_lyric_cache_created_at ON audio_lyric_cache(created_at);

CREATE INDEX IF NOT EXISTS index_audio_tracks_cache_tier ON audio_tracks(cache_tier);

CREATE INDEX IF NOT EXISTS index_audio_tracks_source ON audio_tracks(source);

CREATE INDEX IF NOT EXISTS index_book_sources_bookSourceUrl 
        ON "reader_book_sources"(bookSourceUrl);

CREATE INDEX IF NOT EXISTS index_bookmarks_bookName_bookAuthor 
        ON "reader_bookmarks"(bookName, bookAuthor);

CREATE UNIQUE INDEX IF NOT EXISTS index_books_name_author 
        ON "reader_books"(name, author);

CREATE UNIQUE INDEX IF NOT EXISTS index_caches_key 
        ON "shell_caches"(key);

CREATE INDEX IF NOT EXISTS index_chapters_bookUrl 
        ON "reader_chapters"(bookUrl);

CREATE UNIQUE INDEX IF NOT EXISTS index_chapters_bookUrl_index 
        ON "reader_chapters"(bookUrl, "index");

CREATE UNIQUE INDEX IF NOT EXISTS index_cookies_url 
        ON "shell_cookies"(url);

CREATE INDEX IF NOT EXISTS index_replace_rules_id 
        ON "reader_replace_rules"(id);

CREATE INDEX IF NOT EXISTS index_rssReadRecords_origin ON "reader_rss_read_records"(origin);

CREATE INDEX IF NOT EXISTS index_rssSources_sourceUrl 
        ON "reader_rss_sources"(sourceUrl);

CREATE UNIQUE INDEX IF NOT EXISTS index_searchBooks_bookUrl 
        ON "reader_search_books"(bookUrl);

CREATE INDEX IF NOT EXISTS index_searchBooks_origin 
        ON "reader_search_books"(origin);

CREATE UNIQUE INDEX IF NOT EXISTS index_search_keywords_word 
        ON "reader_search_keywords"(word);

CREATE INDEX IF NOT EXISTS index_theme_presets_kind
    ON "shell_theme_presets"(kind);

CREATE INDEX IF NOT EXISTS index_theme_presets_updated
    ON "shell_theme_presets"(updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS index_video_groups_listId
         ON video_groups(listId) WHERE listId IS NOT NULL;


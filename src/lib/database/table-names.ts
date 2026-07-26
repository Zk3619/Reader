/**
 * 目标态物理表名（M2–M4 完成后）
 * DAO 与适配器一律引用此处，禁止散落无前缀业务表名。
 */

export const SchemaTables = {
  schemaModules: 'schema_modules',
  schemaVersion: 'schema_version',
} as const;

export const ReaderTables = {
  books: 'reader_books',
  bookGroups: 'reader_book_groups',
  bookGroupItems: 'reader_book_group_items',
  chapters: 'reader_chapters',
  chapterCache: 'reader_chapter_cache',
  bookSources: 'reader_book_sources',
  searchBooks: 'reader_search_books',
  searchKeywords: 'reader_search_keywords',
  replaceRules: 'reader_replace_rules',
  rssSources: 'reader_rss_sources',
  rssArticles: 'reader_rss_articles',
  rssStars: 'reader_rss_stars',
  rssReadRecords: 'reader_rss_read_records',
  bookmarks: 'reader_bookmarks',
  readRecord: 'reader_read_record',
  readRecordDetail: 'reader_read_record_detail',
  readRecordSession: 'reader_read_record_session',
  httpTts: 'reader_http_tts',
  txtTocRules: 'reader_txt_toc_rules',
  dictRules: 'reader_dict_rules',
  ruleSubs: 'reader_rule_subs',
  keyboardAssists: 'reader_keyboard_assists',
} as const;

export const AudioTables = {
  tracks: 'audio_tracks',
  groups: 'audio_groups',
  groupItems: 'audio_group_items',
  sources: 'audio_sources',
  searchKeywords: 'audio_search_keywords',
  urlCache: 'audio_url_cache',
  lyricCache: 'audio_lyric_cache',
  authSessions: 'audio_auth_sessions',
  syncState: 'audio_sync_state',
  dislikeRules: 'audio_dislike_rules',
  downloadTasks: 'audio_download_tasks',
  playbackState: 'audio_playback_state',
} as const;

export const VideoTables = {
  /** @deprecated v117 起目标表为 sources；旧迁移仍指向 video_configs */
  configs: 'video_configs',
  /** 配置包源引擎（对齐 audio_sources） */
  sources: 'video_sources',
  tracks: 'video_tracks',
  groups: 'video_groups',
  groupItems: 'video_group_items',
  /** 观看记录（独立于分组，对齐 reader_read_record） */
  playRecord: 'video_play_record',
  sitePref: 'video_site_pref',
  searchKeywords: 'video_search_keywords',
  /** 番剧 / Kazumi 规则（与 Spider sources 隔离） */
  bangumiRules: 'video_bangumi_rules',
  bangumiRuleSubs: 'video_bangumi_rule_subs',
  bangumiSubjects: 'video_bangumi_subjects',
  bangumiPrefs: 'video_bangumi_prefs',
  /** 剧集/点播直链磁盘缓存索引 */
  episodeCache: 'video_episode_cache',
  /** 弹幕离线缓存索引 */
  danmakuCache: 'video_danmaku_cache',
  /** 弹幕手动重匹配覆盖（持久化） */
  danmakuOverride: 'video_danmaku_override',
} as const;

export const ShellTables = {
  favorites: 'shell_favorites',
  previewItems: 'shell_preview_items',
  themePresets: 'shell_theme_presets',
  cookies: 'shell_cookies',
  caches: 'shell_caches',
  servers: 'shell_servers',
} as const;

export const SubTables = {
  sources: 'sub_sources',
  feeds: 'sub_feeds',
  entries: 'sub_entries',
  searchKeywords: 'sub_search_keywords',
} as const;

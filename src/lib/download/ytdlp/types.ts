/** yt-dlp compatible types for Reader's TypeScript runtime. */

export type Protocol =
  | 'http'
  | 'https'
  | 'm3u8'
  | 'm3u8_native'
  | 'http_dash_segments'
  | 'websocket_frag'
  | string;

export interface Format {
  format_id?: string;
  url?: string;
  manifest_url?: string;
  ext?: string;
  protocol?: Protocol;
  format_note?: string;
  format?: string;
  quality?: number | null;
  preference?: number | null;
  language?: string | null;
  language_preference?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null;
  abr?: number | null;
  vbr?: number | null;
  asr?: number | null;
  fps?: number | null;
  width?: number | null;
  height?: number | null;
  resolution?: string | null;
  dynamic_range?: string | null;
  vcodec?: string | null;
  acodec?: string | null;
  container?: string | null;
  audio_ext?: string | null;
  video_ext?: string | null;
  has_drm?: boolean | null;
  source_preference?: number | null;
  http_headers?: Record<string, string>;
  fragments?: Array<{ url: string; duration?: number; filesize?: number }>;
  /** Internal: set by selector when merging video+audio */
  requested_formats?: Format[];
  [key: string]: unknown;
}

export interface Thumbnail {
  id?: string;
  url: string;
  preference?: number | null;
  width?: number | null;
  height?: number | null;
  resolution?: string | null;
}

export interface Subtitle {
  ext?: string;
  url?: string;
  data?: string;
  name?: string;
  protocol?: string;
}

export interface UrlProbeResult {
  url: string;
  status?: number;
  content_type?: string | null;
  content_length?: number | null;
  ok: boolean;
  redirects_to?: string | null;
}

export type ProgressStatus =
  | 'downloading'
  | 'finished'
  | 'error'
  | 'processing'
  | 'after_move';

export interface ProgressHookInfo {
  status: ProgressStatus;
  filename?: string;
  tmpfilename?: string;
  downloaded_bytes?: number;
  total_bytes?: number | null;
  total_bytes_estimate?: number | null;
  elapsed?: number;
  eta?: number | null;
  speed?: number | null;
  fragment_index?: number;
  fragment_count?: number;
  info_dict?: Partial<VideoInfo>;
  _default_template?: string;
}

export type ProgressHook = (info: ProgressHookInfo) => void | Promise<void>;

export interface YoutubeDLOptions {
  format?: string;
  format_sort?: string[] | string;
  format_sort_force?: boolean;
  merges?: boolean;
  merge_output_format?: string;
  outtmpl?: string | Record<string, string>;
  paths?: Record<string, string>;
  cookiefile?: string;
  cookiesfrombrowser?: string | [string, ...unknown[]];
  cookie?: string;
  http_headers?: Record<string, string>;
  proxy?: string;
  retries?: number;
  fragment_retries?: number;
  skip_download?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  no_warnings?: boolean;
  extract_flat?: boolean | 'in_playlist' | 'discard';
  writesubtitles?: boolean;
  writeautomaticsub?: boolean;
  subtitleslangs?: string[];
  subtitlesformat?: string;
  writethumbnail?: boolean;
  embedsubtitles?: boolean;
  embedthumbnail?: boolean;
  addmetadata?: boolean;
  extractaudio?: boolean;
  audioformat?: string;
  audioquality?: string | number;
  keepvideo?: boolean;
  postprocessors?: Array<Record<string, unknown>>;
  progress_hooks?: ProgressHook[];
  match_filter?: string | ((info: VideoInfo) => string | null | undefined);
  playlist_items?: string;
  noplaylist?: boolean;
  age_limit?: number;
  /** Prefer backend download_binary for Cookie/Referer-sensitive hosts */
  useBackendHttp?: boolean;
  [key: string]: unknown;
}

export interface VideoInfo {
  id: string;
  title?: string | null;
  fulltitle?: string | null;
  description?: string | null;
  uploader?: string | null;
  uploader_id?: string | null;
  uploader_url?: string | null;
  channel?: string | null;
  channel_id?: string | null;
  channel_url?: string | null;
  duration?: number | null;
  duration_string?: string | null;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  timestamp?: number | null;
  upload_date?: string | null;
  webpage_url?: string;
  webpage_url_basename?: string;
  original_url?: string;
  extractor?: string;
  extractor_key?: string;
  thumbnail?: string | null;
  thumbnails?: Thumbnail[];
  formats?: Format[];
  requested_formats?: Format[];
  format?: string;
  format_id?: string;
  ext?: string;
  url?: string;
  protocol?: Protocol;
  http_headers?: Record<string, string>;
  subtitles?: Record<string, Subtitle[]>;
  automatic_captions?: Record<string, Subtitle[]>;
  requested_subtitles?: Record<string, Subtitle> | null;
  tags?: string[] | null;
  categories?: string[] | null;
  is_live?: boolean | null;
  was_live?: boolean | null;
  live_status?: string | null;
  age_limit?: number | null;
  /** Playlist / multi-video */
  _type?: 'video' | 'playlist' | 'multi_video' | 'url' | 'url_transparent';
  entries?: Array<VideoInfo | null | undefined>;
  playlist_count?: number | null;
  playlist_index?: number | null;
  /** Set after sanitize */
  _filename?: string;
  /** Cookie / auth hints for download */
  cookies?: string;
  [key: string]: unknown;
}

export interface ExtractorEntry {
  ie_key: string;
  ie_name: string;
  /** Source regex string(s) from yt-dlp; may be approximate for generated stubs */
  valid_url: string | string[] | false | null;
  /** Compiled at registration time when possible */
  valid_url_re?: RegExp | RegExp[];
  /** Lazy factory — implemented extractors return a real IE; stubs fall back */
  create: () => import('./common').InfoExtractor;
  /** When set, used instead of raw valid_url regex (e.g. IE.suitable checks). */
  matchesUrl?: (url: string) => boolean;
  implemented?: boolean;
  module_hint?: string;
}

export interface PostProcessorContext {
  info: VideoInfo;
  filename?: string;
  options: YoutubeDLOptions;
}

export interface PostProcessorResult {
  info: VideoInfo;
  filename?: string;
}

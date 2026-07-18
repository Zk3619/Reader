/**
 * TV-fongmi 契约类型（对齐 CONFIG.md / SPIDER.md / bean）
 */

export type SiteType = 0 | 1 | 3 | 4;

export interface Style {
  type?: string;
  ratio?: number;
}

export interface Site {
  key: string;
  name: string;
  type: SiteType;
  api: string;
  ext?: string;
  jar?: string;
  click?: string;
  playUrl?: string;
  hide?: number;
  timeout?: number;
  searchable?: number;
  changeable?: number;
  quickSearch?: number;
  indexs?: number;
  categories?: string[];
  header?: Record<string, string>;
  style?: Style;
}

export interface Parse {
  name: string;
  type: number;
  url: string;
  ext?: {
    flag?: string[];
    header?: Record<string, string>;
  };
}

export interface LiveSource {
  name: string;
  type?: number;
  url?: string;
  api?: string;
  jar?: string;
  epg?: string;
  logo?: string;
  timeout?: number;
  header?: Record<string, string>;
  groups?: LiveGroup[];
}

export interface LiveGroup {
  name: string;
  channel: LiveChannel[];
  pass?: boolean;
  hide?: boolean;
}

export interface LiveChannel {
  name: string;
  urls: string[];
  logo?: string;
  epg?: string;
  tvgId?: string;
  catchup?: string;
  catchupSource?: string;
}

export interface VodClass {
  type_id: string;
  type_name: string;
  type_flag?: string;
}

export interface FilterValue {
  n: string;
  v: string;
}

export interface Filter {
  key: string;
  name: string;
  value: FilterValue[];
}

export interface Vod {
  vod_id: string;
  vod_name: string;
  type_name?: string;
  vod_pic?: string;
  vod_remarks?: string;
  vod_year?: string;
  vod_area?: string;
  vod_director?: string;
  vod_actor?: string;
  vod_content?: string;
  vod_play_from?: string;
  vod_play_url?: string;
  vod_tag?: string;
  action?: string;
  style?: Style;
  /** 运行时注入 */
  siteKey?: string;
  siteName?: string;
}

export interface Sub {
  name?: string;
  url?: string;
  lang?: string;
  format?: string;
}

export interface Danmaku {
  name?: string;
  url?: string;
}

export interface Drm {
  key?: string;
  type?: string;
}

/** Spider / API 统一返回 */
export interface Result {
  class?: VodClass[];
  list?: Vod[];
  filters?: Record<string, Filter[]>;
  header?: Record<string, string>;
  playUrl?: string;
  url?: string | string[];
  parse?: number;
  jx?: number;
  flag?: string;
  danmaku?: Danmaku[] | string;
  sub?: Sub[];
  drm?: Drm;
  page?: number;
  pagecount?: number;
  limit?: number;
  total?: number;
  msg?: string;
}

export interface VodConfigJson {
  spider?: string;
  wallpaper?: string;
  logo?: string;
  notice?: string;
  sites?: Site[];
  parses?: Parse[];
  lives?: LiveSource[];
  doh?: Array<{ name?: string; url: string; ips?: string[] }>;
  proxy?: Array<{ name?: string; hosts?: string[]; url: string }>;
  rules?: unknown[];
  headers?: Array<{ host: string; header: Record<string, string> }>;
  hosts?: string[];
  flags?: string[];
  ads?: string[];
  danmaku?: string;
  /** depot 多配置 */
  urls?: Array<{ url: string; name?: string }>;
}

export interface FlagEpisode {
  name: string;
  url: string;
}

export interface PlayFlag {
  flag: string;
  episodes: FlagEpisode[];
}

export type TvHubSection =
  | 'home'
  | 'live'
  | 'search'
  | 'keep'
  | 'history'
  | 'detail'
  | 'play'
  | 'settings';

export type JarEngineKind = 'dex-native' | 'dex2jar-host' | 'unavailable';

/** 桌面 Python：native=本机CPython；pyodide=Wasm降级；unavailable=都不可用 */
export type PyEngineKind = 'native' | 'pyodide' | 'unavailable';

export interface TvHistoryRow {
  key: string;
  siteKey: string;
  vodId: string;
  vodName: string;
  vodPic: string;
  flag: string;
  episode: string;
  position: number;
  duration: number;
  updatedAt: number;
  cid: number;
}

export interface TvKeepRow {
  key: string;
  siteKey: string;
  vodId: string;
  vodName: string;
  vodPic: string;
  kind: 'vod' | 'live';
  cid: number;
  createdAt: number;
}

export interface TvConfigRow {
  id: number;
  url: string;
  name: string;
  type: number;
  json: string;
  updatedAt: number;
}

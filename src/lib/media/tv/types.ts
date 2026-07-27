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
  /** spider 扩展参数（字符串或序列化 JSON） */
  ext?: string;
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
  /** M3U tvg-name，logo 模板 {name} 优先用此字段 */
  tvgName?: string;
  catchup?: string;
  catchupSource?: string;
  /** 频道级请求头（含行内 |UA / #EXTHTTP 等解析结果） */
  header?: Record<string, string>;
  ua?: string;
  referer?: string;
  origin?: string;
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
  /** 播放地址：单串 / 交替多画质数组 / FongMi `{values,position}` */
  url?:
    | string
    | string[]
    | {
        values?: Array<{ n?: string; v?: string }>;
        position?: number;
      };
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
  | 'sniff'
  | 'bangumi'
  | 'detail'
  | 'play'
  | 'settings';

export type JarEngineKind = 'dex-native' | 'dex2jar-host' | 'unavailable';

/** 桌面 Python：native=本机CPython；pyodide=Wasm降级；unavailable=都不可用 */
export type PyEngineKind = 'native' | 'pyodide' | 'unavailable';

/** 番剧历史/收藏写入 flag 的 JSON 载荷（siteKey=bangumi） */
export type TvBangumiFlagMeta = {
  ruleId?: string;
  detailUrl?: string;
  episodeUrl?: string;
  bgmId?: number;
};

export type TvKeepKind = 'vod' | 'live' | 'local' | 'bangumi';

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
  /** 缺省 vod；番剧写 bangumi */
  kind?: TvKeepKind;
}

export interface TvKeepRow {
  key: string;
  siteKey: string;
  vodId: string;
  vodName: string;
  vodPic: string;
  kind: TvKeepKind;
  cid: number;
  createdAt: number;
  /** 观看进度（与 history 共用 video_tracks） */
  flag?: string;
  episode?: string;
  position?: number;
  duration?: number;
  updatedAt?: number;
}

export const BANGUMI_SITE_KEY = 'bangumi';

/** 影视自定义片单分组 */
export interface TvVideoGroupRow {
  groupId: number;
  groupName: string;
  order: number;
  show: boolean;
  listId?: string;
  source?: string;
  cover?: string;
  description?: string;
}

export interface TvConfigRow {
  /** video_sources.id（TEXT） */
  id: string;
  /** script_url */
  url: string;
  name: string;
  /** meta_json.type */
  type: number;
  /** script（配置 JSON） */
  json: string;
  updatedAt: number;
  enabled: boolean;
  kind: string;
  customOrder: number;
}

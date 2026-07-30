/**
 * 内置 danmu_api 偏好（对齐 LogVar 环境变量子集）
 * localStorage: reader.video.danmu-api.v1
 */

import { getBiliCookie, resolveBiliCookie } from '@/lib/media/video/danmaku/bilibili-danmaku';

const STORAGE_KEY = 'reader.video.danmu-api.v1';
/** 一次性：旧空 MERGE → 默认爱优腾芒哔聚合 */
const MERGE_DEFAULT_V1_FLAG = 'reader.video.danmu-api.mergeDefault.v1';

/** 全平台默认源顺序：官媒弹幕源优先（第三方点播也按剧名对齐这些源） */
export const DEFAULT_SOURCE_ORDER =
  'tencent,youku,iqiyi,imgo,bilibili,migu,360,sohu,leshi,dandan,animeko,bahamut,xigua,maiduidui,aiyifan,douban,renren,hanjutv';

/**
 * 默认源合并：爱优腾芒哔 + 咪咕 聚合成一份弹幕。
 * 空字符串 = 不合并（命中首个有数据的源即返回）。
 */
export const DEFAULT_MERGE_SOURCE_PAIRS =
  'tencent&youku&iqiyi&imgo&bilibili&migu';

/**
 * 可参与 MERGE_SOURCE_PAIRS 的源（对齐 vendor Envs.MERGE_ALLOWED_SOURCES）。
 * 豆瓣/360 等仅作检索辅助，不可进合并组。
 */
export const MERGE_ALLOWED_SOURCE_IDS = [
  'tencent',
  'youku',
  'iqiyi',
  'imgo',
  'bilibili',
  'migu',
  'renren',
  'hanjutv',
  'bahamut',
  'dandan',
  'sohu',
  'leshi',
  'xigua',
  'maiduidui',
  'aiyifan',
  'animeko',
] as const;

export type DanmuApiPrefs = {
  enabled: boolean;
  sourceOrder: string;
  platformOrder: string;
  mergeSourcePairs: string;
  blockedWords: string;
  danmuOffset: string;
  titleMappingTable: string;
  /** MoviePilot 风格识别词（纯文本多行） */
  recognitionRules: string;
  /** 完全去重 t(1位)+m；默认关，保留刷屏效果 */
  dedupeEnabled: boolean;
  groupMinute: number;
  danmuLimit: number;
  convertTopBottomToScroll: boolean;
  convertColor: 'default' | 'white' | 'color';
  danmuSimplifiedTraditional: 'default' | 'simplified' | 'traditional';
  likeSwitch: boolean;
  strictTitleMatch: boolean;
  enableAnimeEpisodeFilter: boolean;
  bilibiliCookie: string;
  doubanCookie: string;
  vodServers: string;
  otherServer: string;
  customSourceApiUrl: string;
  proxyUrl: string;
  tmdbApiKey: string;
  danmuPushUrl: string;
  autoPushOnMatch: boolean;
};

const DEFAULTS: DanmuApiPrefs = {
  enabled: true,
  sourceOrder: DEFAULT_SOURCE_ORDER,
  platformOrder: '',
  mergeSourcePairs: DEFAULT_MERGE_SOURCE_PAIRS,
  blockedWords: '',
  danmuOffset: '',
  titleMappingTable: '',
  recognitionRules: '',
  dedupeEnabled: false,
  groupMinute: 1,
  danmuLimit: 0,
  convertTopBottomToScroll: false,
  convertColor: 'default',
  danmuSimplifiedTraditional: 'default',
  likeSwitch: true,
  strictTitleMatch: false,
  enableAnimeEpisodeFilter: false,
  bilibiliCookie: '',
  doubanCookie: '',
  vodServers:
    '金蝉@https://zy.jinchancaiji.com,789@https://www.caiji.cyou,听风@https://gctf.tfdh.top',
  otherServer: 'https://api.danmu.icu',
  customSourceApiUrl: '',
  proxyUrl: '',
  tmdbApiKey: '',
  danmuPushUrl: '',
  autoPushOnMatch: false,
};

export function getDanmuApiPrefs(): DanmuApiPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let prefs: DanmuApiPrefs = raw
      ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DanmuApiPrefs>) }
      : { ...DEFAULTS };
    // 旧版本默认 mergeSourcePairs=''，会「首个有数据源即返回」；一次性补上默认聚合
    try {
      if (localStorage.getItem(MERGE_DEFAULT_V1_FLAG) !== '1') {
        localStorage.setItem(MERGE_DEFAULT_V1_FLAG, '1');
        if (!String(prefs.mergeSourcePairs || '').trim()) {
          prefs = { ...prefs, mergeSourcePairs: DEFAULT_MERGE_SOURCE_PAIRS };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        }
      }
    } catch {
      /* */
    }
    return prefs;
  } catch {
    return { ...DEFAULTS };
  }
}

export function setDanmuApiPrefs(patch: Partial<DanmuApiPrefs>): DanmuApiPrefs {
  const next = { ...getDanmuApiPrefs(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  if (patch.doubanCookie !== undefined) {
    void syncDoubanCookieToHub(patch.doubanCookie);
  }
  return next;
}

async function syncDoubanCookieToHub(cookies: string): Promise<void> {
  try {
    const { makeDoubanScope, publishSiteCookies } = await import('@/lib/cookie-hub');
    const scope = makeDoubanScope();
    const trimmed = cookies.trim();
    if (!trimmed) return;
    await publishSiteCookies(scope, 'https://www.douban.com/', trimmed);
  } catch (e) {
    console.warn('[danmu-api] douban cookie hub sync failed', e);
  }
}

async function resolveDoubanCookieFromHub(prefsCookie: string): Promise<string> {
  if (prefsCookie.trim()) return prefsCookie.trim();
  try {
    const { makeDoubanScope, resolveSiteCookies } = await import('@/lib/cookie-hub');
    return resolveSiteCookies(makeDoubanScope(), 'https://www.douban.com/').cookies;
  } catch {
    return '';
  }
}

/** 默认源顺序列表（去空白） */
export function listDefaultSourceIds(): string[] {
  return DEFAULT_SOURCE_ORDER.split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** 解析 SOURCE_ORDER → 启用中的源 id */
export function parseEnabledSources(sourceOrder: string): string[] {
  return String(sourceOrder || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * 解析 MERGE_SOURCE_PAIRS → 参与聚合的源 id（多组合并为一组集合，供开关 UI）。
 * 例：`a&b,c&d` → `['a','b','c','d']`
 */
export function parseMergeSources(mergeSourcePairs: string): string[] {
  const allow = new Set<string>(MERGE_ALLOWED_SOURCE_IDS);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of String(mergeSourcePairs || '').split(/[,;]/)) {
    for (const part of group.split('&')) {
      const id = part.trim();
      if (!id || !allow.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** 按 MERGE_ALLOWED 顺序序列化为单组 `a&b&c`；空则表示不聚合 */
export function serializeMergeSources(ids: Iterable<string>): string {
  const want = new Set(
    [...ids].map((x) => String(x).trim()).filter(Boolean),
  );
  return MERGE_ALLOWED_SOURCE_IDS.filter((id) => want.has(id)).join('&');
}

/** 是否允许该源出现在「参与聚合」开关中 */
export function isMergeAllowedSource(id: string): boolean {
  return (MERGE_ALLOWED_SOURCE_IDS as readonly string[]).includes(id);
}

/**
 * 按默认顺序重排启用列表（未知 id 追加末尾）。
 */
export function serializeEnabledSources(ids: Iterable<string>): string {
  const want = new Set(
    [...ids].map((x) => String(x).trim()).filter(Boolean),
  );
  const order = listDefaultSourceIds();
  const next = order.filter((x) => want.has(x));
  for (const x of want) if (!order.includes(x)) next.push(x);
  return next.join(',');
}

/** 转为 danmu_api Envs.load 可用的环境对象（同步：用缓存/覆盖） */
export function danmuApiPrefsToEnv(
  prefs: DanmuApiPrefs = getDanmuApiPrefs(),
  biliCookieOverride?: string,
  doubanCookieOverride?: string,
): Record<string, string> {
  const biliCookie =
    (biliCookieOverride ?? '').trim() ||
    prefs.bilibiliCookie.trim() ||
    getBiliCookie() ||
    '';
  const doubanCookie =
    (doubanCookieOverride ?? '').trim() || prefs.doubanCookie.trim() || '';
  return {
    TOKEN: '87654321',
    SOURCE_ORDER: prefs.sourceOrder || DEFAULT_SOURCE_ORDER,
    PLATFORM_ORDER: prefs.platformOrder || '',
    MERGE_SOURCE_PAIRS: prefs.mergeSourcePairs || '',
    BLOCKED_WORDS: prefs.blockedWords || '',
    DANMU_OFFSET: prefs.danmuOffset || '',
    TITLE_MAPPING_TABLE: prefs.titleMappingTable || '',
    DANMU_DEDUPE: prefs.dedupeEnabled ? '1' : '0',
    GROUP_MINUTE: String(prefs.groupMinute ?? 1),
    DANMU_LIMIT: String(prefs.danmuLimit ?? 0),
    CONVERT_TOP_BOTTOM_TO_SCROLL: prefs.convertTopBottomToScroll ? 'true' : 'false',
    CONVERT_COLOR: prefs.convertColor || 'default',
    DANMU_SIMPLIFIED_TRADITIONAL: prefs.danmuSimplifiedTraditional || 'default',
    LIKE_SWITCH: prefs.likeSwitch ? 'true' : 'false',
    STRICT_TITLE_MATCH: prefs.strictTitleMatch ? 'true' : 'false',
    ENABLE_ANIME_EPISODE_FILTER: prefs.enableAnimeEpisodeFilter ? 'true' : 'false',
    BILIBILI_COOKIE: biliCookie,
    DOUBAN_COOKIE: doubanCookie,
    VOD_SERVERS: prefs.vodServers || DEFAULTS.vodServers,
    OTHER_SERVER: prefs.otherServer || DEFAULTS.otherServer,
    CUSTOM_SOURCE_API_URL: prefs.customSourceApiUrl || '',
    PROXY_URL: prefs.proxyUrl || '',
    TMDB_API_KEY: prefs.tmdbApiKey || '',
    DANMU_PUSH_URL: prefs.danmuPushUrl || '',
    DANMU_OUTPUT_FORMAT: 'json',
    RATE_LIMIT_MAX_REQUESTS: '0',
    USE_BANGUMI_DATA: 'false',
    ANIME_TITLE_SIMPLIFIED: 'true',
    LOG_LEVEL: 'warn',
  };
}

/** 异步：从 Cookie Hub 拉齐 B 站 / 豆瓣 Cookie 后再生成 env */
export async function danmuApiPrefsToEnvAsync(
  prefs: DanmuApiPrefs = getDanmuApiPrefs(),
): Promise<Record<string, string>> {
  const fromHub = prefs.bilibiliCookie.trim()
    ? ''
    : await resolveBiliCookie();
  const doubanFromHub = await resolveDoubanCookieFromHub(prefs.doubanCookie);
  return danmuApiPrefsToEnv(prefs, fromHub, doubanFromHub);
}

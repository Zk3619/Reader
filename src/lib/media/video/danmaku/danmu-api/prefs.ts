/**
 * 内置 danmu_api 偏好（对齐 LogVar 环境变量子集）
 * localStorage: reader.video.danmu-api.v1
 */

import { getBiliCookie, resolveBiliCookie } from '@/lib/media/video/danmaku/bilibili-danmaku';

const STORAGE_KEY = 'reader.video.danmu-api.v1';

/** 全平台默认源顺序：官媒弹幕源优先（第三方点播也按剧名对齐这些源） */
export const DEFAULT_SOURCE_ORDER =
  'tencent,youku,iqiyi,imgo,bilibili,migu,360,sohu,leshi,dandan,animeko,bahamut,xigua,maiduidui,aiyifan,douban,renren,hanjutv';

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
  mergeSourcePairs: '',
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
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
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
  return next;
}

/** 转为 danmu_api Envs.load 可用的环境对象（同步：用缓存/覆盖） */
export function danmuApiPrefsToEnv(
  prefs: DanmuApiPrefs = getDanmuApiPrefs(),
  biliCookieOverride?: string,
): Record<string, string> {
  const biliCookie =
    (biliCookieOverride ?? '').trim() ||
    prefs.bilibiliCookie.trim() ||
    getBiliCookie() ||
    '';
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
    DOUBAN_COOKIE: prefs.doubanCookie || '',
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

/** 异步：从 Cookie Hub 拉齐音乐 B 站登录态后再生成 env */
export async function danmuApiPrefsToEnvAsync(
  prefs: DanmuApiPrefs = getDanmuApiPrefs(),
): Promise<Record<string, string>> {
  const fromHub = prefs.bilibiliCookie.trim()
    ? ''
    : await resolveBiliCookie();
  return danmuApiPrefsToEnv(prefs, fromHub);
}

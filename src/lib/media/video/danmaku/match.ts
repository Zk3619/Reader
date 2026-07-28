/**
 * 弹幕匹配：
 * 0) 本地缓存
 * 1) 内置 danmu_api（爱优腾芒哔等，含 SOURCE_ORDER 内 bili/bahamut/dandan）
 * 2) 统一源未命中时：已配置弹弹密钥则 BGM 精确映射兜底
 */
import type { Danmu } from 'artplayer-plugin-danmuku';
import {
  extractEpisodeNumber,
  fetchDanDanCommentsByAnimeEpisode,
  getDanDanAnimeIdByBgmId,
  isDanDanPlayConfigured,
} from '@/lib/media/video/danmaku/dandanplay';
import { coerceToArtplayerDanmu } from '@/lib/media/video/danmaku/to-artplayer';
import { filterDanmakuList } from '@/lib/media/video/danmaku/filter';
import { getDanmuApiPrefs } from '@/lib/media/video/danmaku/danmu-api/prefs';
import {
  danmakuOverrideKey,
  getDanmakuMatchOverride,
  prepareVodSearchTitle,
} from '@/lib/media/video/danmaku/normalize-vod-title';
import {
  formatSeasonEpisodeCode,
  normalizeTitleSeason,
  parseSearchKeyword,
} from '@/lib/media/video/danmaku/title-parse';
import { applySearchPreprocessing } from '@/lib/media/video/danmaku/recognition';
import { postProcessDanmakuList } from '@/lib/media/video/danmaku/sample';
import {
  hasCachedDanmaku,
  readCachedDanmaku,
  writeCachedDanmaku,
} from '@/lib/media/video/danmaku/cache';
import { getNetworkKind } from '@/lib/platform/network';

export type MatchDanmakuInput = {
  /** 用于弹弹文件名匹配，如「番名 第01集」 */
  fileNameHint: string;
  /** 番名（优先用于 search/anime） */
  animeTitle?: string;
  /** 集名，用于解析集号 */
  episodeName?: string;
  /** 列表下标（从 0），解析失败时 +1 作集号（对齐 Kazumi listIndex） */
  episodeIndex?: number;
  /** Bangumi subject id（番剧会话） */
  bgmSubjectId?: number | null;
  /** 播放 URL，用于识别 BV/av */
  playUrl?: string;
  /** 点播 id，用于会话内手动覆盖 */
  vodId?: string | number | null;
  siteKey?: string | null;
  /** 手动搜索剧名（跳过/覆盖自动清洗结果） */
  searchTitleOverride?: string;
  /** 手动 1-based 集号 */
  episodeNoOverride?: number;
  /** 不做噪声清洗（手动名已干净时） */
  skipClean?: boolean;
  /** 缓存分级；默认 auto */
  cacheTier?: 'auto' | 'manual';
  /** 跳过缓存读写（调试） */
  skipCache?: boolean;
};

export type MatchDanmakuResult = {
  source: 'danmu-api' | 'dandan' | 'bilibili' | 'cache';
  danmu: Danmu[];
  label: string;
  /** 实际用于搜索的剧名（清洗/映射后） */
  searchTitle?: string;
  episode?: number;
  season?: number;
  fromCache?: boolean;
};

type PreparedMatchQuery = {
  searchTitle: string;
  episode: number;
  season: number;
  fileNameHint: string;
  episodeName: string;
  episodeIndex: number;
  rawTitle: string;
  vodKey: string;
};

const CACHE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

function resolveEpisodeNo(input: MatchDanmakuInput): number {
  if (
    typeof input.episodeNoOverride === 'number' &&
    input.episodeNoOverride > 0
  ) {
    return Math.floor(input.episodeNoOverride);
  }
  const fromName = extractEpisodeNumber(input.episodeName || '', 0);
  if (fromName > 0) return fromName;
  const idx = input.episodeIndex;
  if (typeof idx === 'number' && idx >= 0) return idx + 1;
  return extractEpisodeNumber(input.fileNameHint, 1) || 1;
}

/** 当前播放上下文能否解析出集号（不含 sticky override） */
function hasLiveEpisodeSignal(input: MatchDanmakuInput): boolean {
  if (typeof input.episodeNoOverride === 'number' && input.episodeNoOverride > 0) {
    return true;
  }
  if (typeof input.episodeIndex === 'number' && input.episodeIndex >= 0) {
    return true;
  }
  return extractEpisodeNumber(input.episodeName || '', 0) > 0;
}

/** 清洗 / 识别词 / 映射 / 会话覆盖 → 统一查询参数 */
export function prepareDanmakuMatchQuery(
  input: MatchDanmakuInput,
): PreparedMatchQuery {
  const key = danmakuOverrideKey({
    vodId: input.vodId,
    vodName: input.animeTitle || input.fileNameHint,
    siteKey: input.siteKey,
  });
  const stored = getDanmakuMatchOverride(key);
  const prefs = getDanmuApiPrefs();

  let rawTitle =
    (input.searchTitleOverride || stored?.title || input.animeTitle || '')
      .trim() ||
    (input.fileNameHint || '').trim();

  // 集号优先跟「当前播放」走，禁止 sticky override.episodeNo 把全剧钉死在同一集缓存键上
  let episode = resolveEpisodeNo({ ...input });
  if (
    !hasLiveEpisodeSignal(input) &&
    typeof stored?.episodeNo === 'number' &&
    stored.episodeNo > 0
  ) {
    episode = Math.floor(stored.episodeNo);
  }

  let season: number | null = null;

  // 识别词预处理（在噪声清洗前）
  if (prefs.recognitionRules.trim()) {
    const rec = applySearchPreprocessing(
      rawTitle,
      episode,
      season,
      prefs.recognitionRules,
    );
    rawTitle = rec.text;
    if (rec.episode != null && rec.episode > 0) episode = rec.episode;
    if (rec.season != null && rec.season > 0) season = rec.season;
  }

  const hasManualTitle = Boolean(
    input.searchTitleOverride?.trim() || stored?.title?.trim(),
  );
  const skipForBangumi = Boolean(
    input.bgmSubjectId && input.bgmSubjectId > 0 && !hasManualTitle,
  );
  const prepared = prepareVodSearchTitle(rawTitle, {
    skipClean:
      Boolean(input.skipClean) ||
      Boolean(stored?.skipClean) ||
      hasManualTitle ||
      skipForBangumi,
  });

  let searchTitle = prepared.searchTitle;
  const parsed = parseSearchKeyword(searchTitle);
  if (parsed.season != null && parsed.season > 0) {
    season = season ?? parsed.season;
    searchTitle = parsed.title || searchTitle;
  } else {
    const fromTitle = season ?? null;
    if (fromTitle == null) {
      const s = parseSearchKeyword(
        `${searchTitle} ${input.episodeName || ''}`.trim(),
      ).season;
      if (s != null) season = s;
    }
    searchTitle = normalizeTitleSeason(searchTitle) || searchTitle;
  }
  if (parsed.episode != null && parsed.episode > 0 && !hasManualTitle) {
    // 仅当当前播放无法给出集号时，才允许从片名关键词带出集数
    if (!hasLiveEpisodeSignal(input)) {
      episode = parsed.episode;
    }
  }

  const resolvedSeason = Math.max(1, season ?? 1);
  const epCode = formatSeasonEpisodeCode(resolvedSeason, episode);
  const fileNameHint =
    searchTitle && episode > 0
      ? `${searchTitle} ${epCode}`
      : searchTitle || input.fileNameHint.trim();

  return {
    searchTitle,
    episode,
    season: resolvedSeason,
    fileNameHint,
    episodeName: input.episodeName || `第${episode}集`,
    episodeIndex: Math.max(0, episode - 1),
    rawTitle: prepared.raw || rawTitle,
    vodKey: key,
  };
}

function finalizeDanmu(
  danmu: Danmu[],
  label: string,
  source: MatchDanmakuResult['source'],
  meta?: { searchTitle?: string; episode?: number; season?: number },
  fromCache = false,
): MatchDanmakuResult | null {
  const prefs = getDanmuApiPrefs();
  let list = filterDanmakuList(danmu);
  list = postProcessDanmakuList(list, {
    dedupe: prefs.dedupeEnabled,
    // DANMU_LIMIT 单位为 k（千），与 danmu_api 一致
    limit: prefs.danmuLimit > 0 ? prefs.danmuLimit * 1000 : 0,
  });
  if (!list.length) return null;
  return {
    source,
    danmu: list,
    label,
    searchTitle: meta?.searchTitle,
    episode: meta?.episode,
    season: meta?.season,
    fromCache,
  };
}

async function loadDanmuFromComments(
  raw: unknown,
  label: string,
  source: MatchDanmakuResult['source'] = 'dandan',
  meta?: { searchTitle?: string; episode?: number; season?: number },
): Promise<MatchDanmakuResult | null> {
  const danmu = coerceToArtplayerDanmu(raw);
  if (!danmu.length) return null;
  return finalizeDanmu(danmu, label, source, meta);
}

async function tryReadCache(
  q: PreparedMatchQuery,
  allowStale: boolean,
): Promise<MatchDanmakuResult | null> {
  try {
    const hit = await readCachedDanmaku(q.vodKey, q.episode);
    if (!hit?.danmu?.length) return null;
    const age = Date.now() - (hit.cachedAt || 0);
    if (!allowStale && age > CACHE_FRESH_MS) return null;
    return finalizeDanmu(
      hit.danmu,
      hit.label || '本地缓存',
      'cache',
      {
        searchTitle: hit.searchTitle || q.searchTitle,
        episode: q.episode,
        season: q.season,
      },
      true,
    );
  } catch (e) {
    console.warn('[danmaku] cache read failed', e);
    return null;
  }
}

async function persistMatchResult(
  input: MatchDanmakuInput,
  q: PreparedMatchQuery,
  result: MatchDanmakuResult,
): Promise<void> {
  if (input.skipCache || result.source === 'cache' || !result.danmu.length) {
    return;
  }
  try {
    await writeCachedDanmaku({
      vodKey: q.vodKey,
      episode: q.episode,
      searchTitle: q.searchTitle,
      source: result.source,
      label: result.label,
      danmu: result.danmu,
      tier: input.cacheTier ?? 'auto',
    });
  } catch (e) {
    console.warn('[danmaku] cache write failed', e);
  }
}

/** 尝试自动匹配并拉取弹幕；无可用源返回 null（不抛） */
export async function tryMatchDanmaku(
  input: MatchDanmakuInput,
): Promise<MatchDanmakuResult | null> {
  const q = prepareDanmakuMatchQuery(input);
  const title = q.searchTitle;
  const episode = q.episode;
  const meta = { searchTitle: title, episode, season: q.season };
  const offline = getNetworkKind() === 'offline';

  if (title && title !== (input.animeTitle || '').trim()) {
    console.info('[danmaku] title normalized', {
      from: input.animeTitle || input.fileNameHint,
      to: title,
      episode,
      season: q.season,
    });
  }

  if (!input.skipCache) {
    if (offline) {
      const cached = await tryReadCache(q, true);
      if (cached) return cached;
      return null;
    }
    // 在线：新鲜缓存可先用。不再后台全源刷新——会触发豆瓣/人人等第三方
    // 403/超时刷屏，且与播放器时间轴无关；过期后再走线上匹配即可。
    const fresh = await tryReadCache(q, false);
    if (fresh) return fresh;
  }

  const online = await matchOnlineSources(input, q, meta);
  if (online) {
    await persistMatchResult(input, q, online);
    return online;
  }

  // 全部失败：过期缓存兜底
  if (!input.skipCache) {
    const stale = await tryReadCache(q, true);
    if (stale) return stale;
  }
  return null;
}

async function matchOnlineSources(
  input: MatchDanmakuInput,
  q: PreparedMatchQuery,
  meta: { searchTitle: string; episode: number; season: number },
): Promise<MatchDanmakuResult | null> {
  const title = q.searchTitle;
  const episode = q.episode;

  if (getDanmuApiPrefs().enabled) {
    try {
      const { fetchBuiltinDanmaku } = await import(
        '@/lib/media/video/danmaku/danmu-api'
      );
      const builtin = await fetchBuiltinDanmaku({
        fileNameHint: q.fileNameHint,
        animeTitle: title,
        episodeName: q.episodeName,
        episodeIndex: q.episodeIndex,
      });
      if (builtin) {
        const hit = await loadDanmuFromComments(
          builtin.raw,
          builtin.label,
          'danmu-api',
          meta,
        );
        if (hit) return hit;
      }
    } catch (e) {
      console.warn('[danmaku] builtin danmu-api failed', e);
    }
  }

  // 统一源未命中时：仅当已配置弹弹密钥，才用 BGM 精确映射作最后兜底（避免与 SOURCE_ORDER 内 dandan 双拉）
  if (isDanDanPlayConfigured()) {
    const bgmId = input.bgmSubjectId;
    if (bgmId && bgmId > 0) {
      try {
        const animeId = await getDanDanAnimeIdByBgmId(bgmId);
        if (animeId > 0) {
          const raw = await fetchDanDanCommentsByAnimeEpisode(animeId, episode);
          const hit = await loadDanmuFromComments(
            raw,
            `BGM ${bgmId} · EP${episode}`,
            'dandan',
            meta,
          );
          if (hit) return hit;
        }
      } catch (e) {
        console.warn('[danmaku] dandan bgm fallback failed', e);
      }
    }
  }

  return null;
}

/** 供 UI 判断是否已有弹幕缓存（决定是否发「正在获取」提示） */
export async function peekDanmakuCacheExists(
  input: Pick<MatchDanmakuInput, 'vodId' | 'animeTitle' | 'fileNameHint' | 'siteKey' | 'episodeNoOverride' | 'episodeName' | 'episodeIndex'>,
): Promise<boolean> {
  try {
    const q = prepareDanmakuMatchQuery(input as MatchDanmakuInput);
    return await hasCachedDanmaku(q.vodKey, q.episode);
  } catch {
    return false;
  }
}

export function parseBangumiSubjectIdFromVodId(
  vodId: string | undefined | null,
): number | null {
  if (!vodId) return null;
  const m = String(vodId).match(/^bangumi:(\d+)$/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 网易云 API 客户端（账号态平台源 netease，与 LX 五源 wy 并存）
 */

import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import {
  eapiLyricPost,
  eapiPlayerUrlPost,
  eapiPost,
  eapiPostBody,
  unwrapEapiBody,
} from '@/lib/media/audio/platform/api/eapi-crypto';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { LyricBundle, MusicQuality } from '@/lib/media/audio/lyric-types';
import { loadAuthSession } from '@/lib/media/audio/platform/auth/session';
import {
  getPlayQuality,
  qualityFallbackChain,
  wyBrForQuality,
  wyLevelForQuality,
} from '@/lib/media/audio/music-quality';

const NETEASE_DEFAULT_COOKIE = 'MUSIC_U=; os=pc; appver=8.10.35';

/** 对齐 NeriPlayer 音质降级（level 字符串） */
const NETEASE_LEVEL_FALLBACK = [
  'jymaster',
  'sky',
  'jyeffect',
  'hires',
  'lossless',
  'exhigh',
  'higher',
  'standard',
] as const;

async function resolveNeteaseCookies(cookies?: string): Promise<string> {
  if (cookies?.trim()) return cookies;
  const auth = await loadAuthSession('netease');
  if (auth?.cookies?.trim()) {
    let c = auth.cookies;
    if (!/os=/i.test(c)) c += '; os=pc';
    if (!/appver=/i.test(c)) c += '; appver=8.10.35';
    return c;
  }
  return NETEASE_DEFAULT_COOKIE;
}

export interface NeteasePlaylistSummary {
  id: string;
  name: string;
  coverUrl?: string;
  trackCount: number;
}

const NETEASE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 明文 /api：优先 plugin-http（download_binary 对账号接口常空响应） */
async function neteasePlainApi<T>(
  url: string,
  cookies: string,
  form?: Record<string, string | number>,
): Promise<T | null> {
  const body = form
    ? Object.entries(form)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : undefined;
  const headers: Record<string, string> = {
    ...(body === undefined ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
    Cookie: cookies,
    Referer: 'https://music.163.com/',
    'User-Agent': NETEASE_UA,
  };
  const tryOnce = async (useBackendHttp: boolean): Promise<T | null> => {
    const res = await request(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body,
      useBackendHttp,
      ignorePageNavigationAbort: true,
      allowNon2xx: true,
    });
    const text = (await res.text()).trim();
    if (!text) return null;
    return JSON.parse(text) as T;
  };

  if (!isTauri()) return tryOnce(false);
  const viaPlugin = await tryOnce(false);
  if (viaPlugin) return viaPlugin;
  return tryOnce(true);
}

let cachedAccountUid: { cookieFingerprint: string; uid: string } | null = null;

function cookieFingerprint(cookies: string): string {
  const musicU = cookies.match(/MUSIC_U\s*=\s*([^;]+)/i)?.[1]?.trim() ?? '';
  return musicU.slice(0, 24);
}

function clearNeteaseUidCache(): void {
  cachedAccountUid = null;
}

export { clearNeteaseUidCache };

/** 从 account/get 响应提取 uid（兼容多种字段形态） */
function extractNeteaseUid(body: Record<string, unknown> | null | undefined): string | null {
  if (!body || typeof body !== 'object') return null;
  const profile = body.profile as { userId?: number | string } | undefined;
  const account = body.account as { id?: number | string } | undefined;
  const data = body.data as
    | { profile?: { userId?: number | string }; account?: { id?: number | string } }
    | undefined;
  const raw =
    profile?.userId ??
    account?.id ??
    data?.profile?.userId ??
    data?.account?.id ??
    (body.userId as number | string | undefined);
  if (raw == null || raw === '') return null;
  const uid = String(raw).trim();
  return /^\d+$/.test(uid) && Number(uid) > 0 ? uid : null;
}

async function fetchNeteaseAccountBody(
  cookies: string,
): Promise<Record<string, unknown> | null> {
  // 明文 / eapi 优先：weapi 在 Tauri 下对本接口经常空响应，避免启动刷屏
  const attempts: Array<() => Promise<Record<string, unknown> | null>> = [
    () =>
      neteasePlainApi<Record<string, unknown>>(
        'https://music.163.com/api/nuser/account/get',
        cookies,
        {},
      ),
    async () => {
      try {
        return await eapiPostBody<Record<string, unknown>>(
          '/api/nuser/account/get',
          {},
          cookies,
        );
      } catch {
        return null;
      }
    },
    async () => {
      try {
        return await weapiPost<Record<string, unknown>>('w/nuser/account/get', {}, cookies);
      } catch {
        return null;
      }
    },
  ];

  for (const run of attempts) {
    try {
      const body = await run();
      if (!body) continue;
      if (extractNeteaseUid(body) || Number(body.code) === 200) {
        return body;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/** 登录账号 uid（扫码/Cookie 后可用于拉取「我的歌单」） */
export async function getNeteaseAccountUid(): Promise<string | null> {
  const cookies = await resolveNeteaseCookies();
  if (!/MUSIC_U\s*=\s*[^;\s]+/i.test(cookies)) {
    clearNeteaseUidCache();
    return null;
  }
  const fp = cookieFingerprint(cookies);
  if (cachedAccountUid?.cookieFingerprint === fp) return cachedAccountUid.uid;

  const body = await fetchNeteaseAccountBody(cookies);
  const uid = extractNeteaseUid(body);
  if (!uid) return null;
  cachedAccountUid = { cookieFingerprint: fp, uid };
  return uid;
}

/** 当前用户创建/收藏的歌单（需登录）；失败时不回落推荐，避免误把推荐当「我的」 */
export async function getUserPlaylists(limit = 50): Promise<NeteasePlaylistSummary[]> {
  const cookies = await resolveNeteaseCookies();
  if (!/MUSIC_U\s*=\s*[^;\s]+/i.test(cookies)) return [];
  const uid = await getNeteaseAccountUid();
  if (!uid) return [];

  const mapList = (list: Array<Record<string, unknown>>): NeteasePlaylistSummary[] =>
    list
      .map((p) => ({
        id: String(p.id ?? ''),
        name: String(p.name ?? ''),
        coverUrl: String(
          (p.coverImgUrl as string | undefined) ?? (p.picUrl as string | undefined) ?? '',
        ),
        trackCount: Number(p.trackCount ?? 0),
      }))
      .filter((p) => p.id);

  // 明文优先，避免 weapi 空响应刷屏
  try {
    const body = await neteasePlainApi<{ playlist?: Array<Record<string, unknown>> }>(
      `https://music.163.com/api/user/playlist?uid=${encodeURIComponent(uid)}&limit=${limit}&offset=0`,
      cookies,
    );
    if (body?.playlist?.length) return mapList(body.playlist);
  } catch {
    /* fall through */
  }

  try {
    const body = await eapiPostBody<{
      playlist?: Array<Record<string, unknown>>;
      code?: number;
    }>('/api/user/playlist', { uid: Number(uid), limit, offset: 0, includeVideo: true }, cookies);
    if (body.playlist?.length) return mapList(body.playlist);
  } catch {
    /* fall through */
  }

  try {
    const body = await weapiPost<{
      playlist?: Array<Record<string, unknown>>;
      code?: number;
    }>(
      'user/playlist',
      { uid: Number(uid), limit, offset: 0, includeVideo: true },
      cookies,
    );
    return mapList(body.playlist ?? []);
  } catch {
    return [];
  }
}

function mapNeteaseSong(s: Record<string, unknown>): AudioTrack | null {
  const songId = String(s.id ?? '');
  if (!songId) return null;
  const ms = Number(s.dt ?? s.duration ?? 0);
  const artists = (s.ar as Array<{ id?: number | string; name?: string }> | undefined) ??
    (s.artists as Array<{ id?: number | string; name?: string }> | undefined) ??
    [];
  const base: AudioTrack = {
    id: buildTrackId('netease', songId),
    name: String(s.name ?? ''),
    artist: artists.map((a) => a.name).filter(Boolean).join('、') || '未知',
    source: 'netease',
    duration: ms > 0 ? formatDurationSec(ms / 1000) : '00:00',
    meta: { songId },
  };
  const al = (s.al ?? s.album) as
    | { id?: number | string; name?: string; picUrl?: string }
    | undefined;
  const privilege = s.privilege as { maxbr?: number; maxBrLevel?: string } | undefined;
  const maxbr = Number(privilege?.maxbr ?? 0);
  const qualitys: string[] = ['128k'];
  if (maxbr >= 192000) qualitys.push('192k');
  if (maxbr >= 320000) qualitys.push('320k');
  if (maxbr >= 999000 || privilege?.maxBrLevel === 'lossless') qualitys.push('flac');
  if (privilege?.maxBrLevel === 'hires') qualitys.push('flac24bit');
  return {
    ...base,
    meta: {
      ...base.meta,
      songmid: String(base.meta.songId),
      albumId: String(al?.id ?? ''),
      albumName: String(al?.name ?? ''),
      singerId: String(artists[0]?.id ?? ''),
      coverUrl: String(al?.picUrl ?? ''),
      qualitys,
      _qualitys: Object.fromEntries(qualitys.map((q) => [q, {}])),
    },
  };
}

export async function neteaseSearch(
  keyword: string,
  page = 1,
  limit = 30,
): Promise<AudioTrack[]> {
  const cookies = await resolveNeteaseCookies();
  const offset = Math.max(0, (page - 1) * limit);

  try {
    const raw = await eapiPost<unknown>('/api/cloudsearch/pc', {
      s: keyword,
      type: 1,
      limit,
      offset,
      total: page === 1,
    });
    const body = unwrapEapiBody<{
      code?: number;
      result?: { songs?: Record<string, unknown>[] };
    }>(raw);
    if (body.code === 200 && body.result?.songs?.length) {
      return body.result.songs
        .map(mapNeteaseSong)
        .filter((t): t is AudioTrack => t !== null);
    }
  } catch {
    /* fall through weapi */
  }

  try {
    const body = await weapiPost<{
      code?: number;
      result?: { songs?: Record<string, unknown>[] };
    }>(
      'cloudsearch/get/web',
      { s: keyword, type: 1, limit, offset, total: true },
      cookies,
    );
    const songs = body.result?.songs ?? [];
    return songs.map(mapNeteaseSong).filter((t): t is AudioTrack => t !== null);
  } catch {
    return [];
  }
}

function mapNeteasePlaylistSummaries(
  list: Array<Record<string, unknown>>,
): NeteasePlaylistSummary[] {
  return list
    .map((p) => ({
      id: String(p.id ?? ''),
      name: String(p.name ?? ''),
      coverUrl: String(
        (p.picUrl as string | undefined) ??
          (p.coverImgUrl as string | undefined) ??
          '',
      ).replace(/^http:\/\//i, 'https://'),
      trackCount: Number(p.trackCount ?? 0),
    }))
    .filter((p) => p.id);
}

/** 个性化推荐歌单：对齐 Neri `result` 字段；weapi 空响应退明文；登录失败匿名回退 */
export async function getRecommendedPlaylists(limit = 30): Promise<NeteasePlaylistSummary[]> {
  type PersonalizedBody = {
    code?: number;
    result?: Array<Record<string, unknown>>;
    recommend?: Array<Record<string, unknown>>;
  };
  const parse = (body: PersonalizedBody | null): NeteasePlaylistSummary[] => {
    if (!body) return [];
    const code = Number(body.code ?? 200);
    if (code === 301 || code === 50000005) throw new Error('NEED_LOGIN');
    // NCM / Neri 主字段为 result；旧实现误读 recommend
    return mapNeteasePlaylistSummaries(body.result ?? body.recommend ?? []);
  };
  const fetchOnce = async (cookies?: string): Promise<NeteasePlaylistSummary[]> => {
    try {
      const body = await weapiPost<PersonalizedBody>(
        'personalized/playlist',
        { limit, total: true, n: limit },
        cookies,
      );
      const list = parse(body);
      if (list.length) return list;
    } catch (e) {
      if (String(e).includes('NEED_LOGIN')) throw e;
      console.warn('[netease] personalized/playlist weapi failed', e);
    }
    // Tauri 下 weapi 常空响应：退明文 /api
    const plain = await neteasePlainApi<PersonalizedBody>(
      'https://music.163.com/api/personalized/playlist',
      cookies ?? NETEASE_DEFAULT_COOKIE,
      { limit, total: 'true', n: limit },
    );
    return parse(plain);
  };

  const auth = await loadAuthSession('netease');
  if (auth?.cookies?.trim()) {
    try {
      const list = await fetchOnce(auth.cookies);
      if (list.length) return list;
    } catch (e) {
      if (!String(e).includes('NEED_LOGIN')) {
        console.warn('[netease] personalized/playlist logged-in failed', e);
      }
    }
  }

  try {
    return await fetchOnce(undefined);
  } catch (e) {
    console.warn('[netease] personalized/playlist anonymous failed', e);
    return [];
  }
}

/** 精品歌单（对齐 Neri Explore highquality/list）；weapi 空响应退明文 */
export async function getHighQualityPlaylists(
  cat = '全部',
  limit = 50,
): Promise<NeteasePlaylistSummary[]> {
  type HighQualityBody = {
    code?: number;
    playlists?: Array<Record<string, unknown>>;
  };
  const auth = await loadAuthSession('netease');
  const cookies = auth?.cookies?.trim() || NETEASE_DEFAULT_COOKIE;
  try {
    const body = await weapiPost<HighQualityBody>(
      'playlist/highquality/list',
      { cat, limit, lasttime: 0, total: true },
      cookies,
    );
    const list = mapNeteasePlaylistSummaries(body.playlists ?? []);
    if (list.length) return list;
  } catch (e) {
    console.warn('[netease] highquality/list weapi failed', e);
  }
  try {
    const plain = await neteasePlainApi<HighQualityBody>(
      'https://music.163.com/api/playlist/highquality/list',
      cookies,
      { cat, limit, lasttime: 0, total: 'true' },
    );
    return mapNeteasePlaylistSummaries(plain?.playlists ?? []);
  } catch (e) {
    console.warn('[netease] highquality/list plain failed', e);
    return [];
  }
}

interface NeteasePlaylistDetailBody {
  code?: number;
  playlist?: {
    tracks?: Array<Record<string, unknown>>;
    trackIds?: Array<{ id?: number | string }>;
  };
}

function assertNeteaseLoggedIn(code: number | undefined): void {
  if (code === 301 || code === 50000005) throw new Error('NEED_LOGIN');
}

/** 歌单详情：对齐 NeriPlayer 的 api/v6/playlist/detail，weapi 仅作最后兜底 */
async function fetchNeteasePlaylistDetailBody(
  playlistId: string,
  cookies: string,
): Promise<NeteasePlaylistDetailBody | null> {
  const params = { id: playlistId, n: 100000, s: 8 };
  const attempts: Array<() => Promise<NeteasePlaylistDetailBody | null>> = [
    () => eapiPostBody<NeteasePlaylistDetailBody>('/api/v6/playlist/detail', params, cookies),
    () =>
      neteasePlainApi<NeteasePlaylistDetailBody>(
        'https://music.163.com/api/v6/playlist/detail',
        cookies,
        params,
      ),
    () => weapiPost<NeteasePlaylistDetailBody>('v3/playlist/detail', params, cookies),
  ];

  for (const run of attempts) {
    try {
      const body = await run();
      if (!body) continue;
      assertNeteaseLoggedIn(body.code);
      if (body.playlist) return body;
    } catch (e) {
      if (String(e).includes('NEED_LOGIN')) throw e;
      console.warn('[netease] playlist/detail attempt failed', e);
    }
  }
  return null;
}

/** 按 id 批量补齐歌曲详情（歌单只回 trackIds 时使用），对齐 NeriPlayer 300 一批 */
async function fetchNeteaseSongsByIds(
  ids: string[],
  cookies: string,
): Promise<Map<string, AudioTrack>> {
  const result = new Map<string, AudioTrack>();
  const CHUNK = 300;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const params = {
      ids: `[${chunk.join(',')}]`,
      c: JSON.stringify(chunk.map((id) => ({ id: Number(id) }))),
    };
    const attempts: Array<() => Promise<{ songs?: Array<Record<string, unknown>> } | null>> = [
      () => weapiPost<{ songs?: Array<Record<string, unknown>> }>('v3/song/detail', params, cookies),
      () =>
        neteasePlainApi<{ songs?: Array<Record<string, unknown>> }>(
          'https://music.163.com/api/v3/song/detail',
          cookies,
          params,
        ),
    ];
    for (const run of attempts) {
      try {
        const body = await run();
        const songs = body?.songs ?? [];
        if (!songs.length) continue;
        for (const s of songs) {
          const track = mapNeteaseSong(s);
          if (track?.meta.songId) result.set(String(track.meta.songId), track);
        }
        break;
      } catch (e) {
        console.warn('[netease] song/detail attempt failed', e);
      }
    }
  }
  return result;
}

export async function getPlaylistDetail(playlistId: string): Promise<AudioTrack[]> {
  const cookies = await resolveNeteaseCookies();
  const body = await fetchNeteasePlaylistDetailBody(playlistId, cookies);
  if (!body?.playlist) throw new Error('网易云歌单详情返回空响应');

  const tracks = (body.playlist.tracks ?? [])
    .map((t) => mapNeteaseSong(t))
    .filter((t): t is AudioTrack => t !== null);
  const trackIds = (body.playlist.trackIds ?? [])
    .map((t) => String(t?.id ?? ''))
    .filter(Boolean);
  if (trackIds.length <= tracks.length) return tracks;

  // 大歌单只回 trackIds：按 id 顺序补齐，保持歌单原始排序
  const known = new Map(tracks.map((t) => [String(t.meta.songId), t]));
  const missing = trackIds.filter((id) => !known.has(id));
  const fetched = missing.length ? await fetchNeteaseSongsByIds(missing, cookies) : new Map();
  const merged = trackIds
    .map((id) => known.get(id) ?? fetched.get(id))
    .filter((t): t is AudioTrack => Boolean(t));
  return merged.length ? merged : tracks;
}

function levelsForQuality(q: MusicQuality): string[] {
  const preferred = wyLevelForQuality(q);
  const start = NETEASE_LEVEL_FALLBACK.indexOf(
    preferred as (typeof NETEASE_LEVEL_FALLBACK)[number],
  );
  if (start >= 0) return [...NETEASE_LEVEL_FALLBACK.slice(start)];
  return [preferred, ...NETEASE_LEVEL_FALLBACK];
}

export interface NeteaseStreamResult {
  url: string;
  /** 接口明确返回 freeTrialInfo：试听片段，长度不固定 */
  isPreview: boolean;
  contentLength?: number;
}

type NeteaseUrlDataItem = {
  url?: string | null;
  code?: number;
  size?: number;
  type?: string | null;
  fee?: number;
  freeTrialInfo?: unknown;
  freeTrialPrivilege?: { cannotListenReason?: number } | null;
};

function isNeteasePreviewClip(data: NeteaseUrlDataItem): boolean {
  const info = data.freeTrialInfo;
  return info != null && info !== false;
}

function parseNeteaseUrlData(data: NeteaseUrlDataItem | undefined): NeteaseStreamResult | null {
  const url = data?.url?.trim();
  if (!url || url === 'null') return null;
  const size = Number(data?.size ?? 0);
  return {
    url: url.startsWith('http://') ? url.replace(/^http:\/\//i, 'https://') : url,
    isPreview: data ? isNeteasePreviewClip(data) : false,
    contentLength: size > 0 ? size : undefined,
  };
}

/**
 * 网易云取流：对齐 NeriPlayer
 * - 解析 freeTrialInfo，试听不算完整成功
 * - 当前音质仅试听时继续降级尝试完整音质
 * - 全部音质仅试听时返回 isPreview=true 供上层跨源兜底
 */
export async function getNeteaseSongStream(
  track: AudioTrack,
  quality?: MusicQuality,
): Promise<NeteaseStreamResult | null> {
  const cookies = await resolveNeteaseCookies();
  const id = String(track.meta.songId ?? track.meta.songmid ?? '');
  if (!id) return null;
  const preferred = quality ?? getPlayQuality(track);
  const levels = levelsForQuality(preferred);
  const brChain = qualityFallbackChain(preferred).map(wyBrForQuality);

  let previewFallback: NeteaseStreamResult | null = null;

  for (const level of levels) {
    try {
      const body = await weapiPost<{
        data?: NeteaseUrlDataItem[];
        code?: number;
      }>(
        'song/enhance/player/url/v1',
        { ids: JSON.stringify([id]), level, encodeType: 'flac' },
        cookies,
      );
      if (body.code === 301) return null;
      const parsed = parseNeteaseUrlData(body.data?.[0]);
      if (!parsed) continue;
      if (!parsed.isPreview) return parsed;
      previewFallback ??= parsed;
      console.warn('[netease] preview-only at level, try lower', level, track.name);
    } catch {
      /* try next */
    }
  }

  for (const br of brChain) {
    try {
      const body = await eapiPlayerUrlPost<{
        data?: NeteaseUrlDataItem[];
      }>({ ids: [id], br }, cookies);
      const parsed = parseNeteaseUrlData(body.data?.[0]);
      if (!parsed) continue;
      if (!parsed.isPreview) return parsed;
      previewFallback ??= parsed;
      console.warn('[netease] preview-only at br, try lower', br, track.name);
    } catch {
      /* try next */
    }
  }

  try {
    const body = await weapiPost<{ data?: NeteaseUrlDataItem[] }>(
      'song/enhance/player/url',
      { ids: JSON.stringify([id]), br: wyBrForQuality(preferred) },
      cookies,
    );
    const parsed = parseNeteaseUrlData(body.data?.[0]);
    if (parsed && !parsed.isPreview) return parsed;
    if (parsed?.isPreview) previewFallback ??= parsed;
  } catch {
    /* fall through */
  }

  return previewFallback;
}

export async function getNeteaseSongUrl(
  track: AudioTrack,
  quality?: MusicQuality,
): Promise<string | null> {
  const stream = await getNeteaseSongStream(track, quality);
  return stream?.url ?? null;
}

export async function getNeteaseLyric(track: AudioTrack): Promise<string | null> {
  const bundle = await getNeteaseLyricBundle(track);
  return bundle?.lyric ?? bundle?.tlyric ?? null;
}

export async function getNeteaseLyricBundle(track: AudioTrack): Promise<LyricBundle | null> {
  const id = String(track.meta.songId ?? track.meta.songmid ?? '');
  if (!id) return null;
  const cookies = await resolveNeteaseCookies();
  const { fixWyTimeLabel, parseWyYrcBundle } = await import(
    '@/lib/media/audio/platform/api/wy-yrc-parse'
  );

  const toBundle = (info: {
    lyric: string;
    tlyric: string;
    rlyric: string;
    lxlyric: string;
  }): LyricBundle | null => {
    if (!info.lyric?.trim() && !info.tlyric?.trim()) return null;
    return {
      lyric: info.lyric || null,
      tlyric: info.tlyric || null,
      rlyric: info.rlyric || null,
      lxlyric: info.lxlyric || null,
    };
  };

  try {
    const body = await eapiLyricPost<{
      code?: number;
      lrc?: { lyric?: string };
      tlyric?: { lyric?: string };
      romalrc?: { lyric?: string };
      yrc?: { lyric?: string };
      ytlrc?: { lyric?: string };
      yromalrc?: { lyric?: string };
    }>(
      {
        id,
        cp: false,
        tv: 0,
        lv: 0,
        rv: 0,
        kv: 0,
        yv: 0,
        ytv: 0,
        yrv: 0,
      },
      cookies,
    );
    if (body.code === 200 || body.lrc?.lyric || body.yrc?.lyric) {
      const fixed = fixWyTimeLabel(body.lrc?.lyric, body.tlyric?.lyric, body.romalrc?.lyric);
      return toBundle(
        parseWyYrcBundle(
          body.yrc?.lyric,
          body.ytlrc?.lyric,
          body.yromalrc?.lyric,
          fixed.lrc,
          fixed.tlrc,
          fixed.romalrc,
        ),
      );
    }
  } catch {
    /* weapi fallback */
  }

  try {
    const body = await weapiPost<{
      lrc?: { lyric?: string };
      tlyric?: { lyric?: string };
      romalrc?: { lyric?: string };
    }>('song/lyric', { id, lv: -1, kv: -1, tv: -1, rv: -1 }, cookies);
    const fixed = fixWyTimeLabel(body.lrc?.lyric, body.tlyric?.lyric, body.romalrc?.lyric);
    return toBundle(parseWyYrcBundle(null, null, null, fixed.lrc, fixed.tlrc, fixed.romalrc));
  } catch {
    return null;
  }
}
/**
 * 统一在线/本地曲目 URL 解析
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { resolveLocalTrackUrl } from '@/lib/media/audio/library/local-resolver';
import {
  userApiMusicUrl,
  isActiveUserApiId,
  listEnabledUserApiScriptIdsForUrl,
  listUserApiScriptIdsForPlayback,
  listUserApiScripts,
  getActiveUserApiDisplayName,
} from '@/lib/media/audio/online/user-api-engine';
import { getMusicOfflineMode } from '@/lib/media/audio/online/user-api-settings';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { getPlayQuality } from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import {
  cacheMusicTrackAudio,
  createAudioObjectUrl,
  getCachedMusicTrackByTrackId,
} from '@/lib/media/audio/audio-disk-cache';
import {
  resolveLastResortTrackUrl,
  getOtherSourceTracks,
  tryResolveBuiltinUrl,
  notifyToggleTry,
  isFallbackResolverEnabled,
  type ToggleSourceCallbacks,
} from '@/lib/media/audio/platform/fallback-resolver';
import { MusicPlaybackStatusText } from '@/lib/media/audio/music-playback-status';
import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';
import { getToggleMusicInfo } from '@/lib/media/audio/track-toggle';

/** 按脚本独立熔断：依据错误信号，不依据脚本名/域名打分 */
const primaryFailStreakByScript = new Map<string, number>();
const primaryCircuitUntilByScript = new Map<string, number>();
/** 单次取链内硬失败跳过，避免同一次换源反复打同一脚本 */
const sessionHardSkipScripts = new Set<string>();

function errorMessage(reason?: unknown): string {
  return reason instanceof Error ? reason.message : String(reason ?? '');
}

/** 公共代理滥用信号（脚本通用文案，不绑定具体源） */
function isUserApiIpBanError(reason?: unknown): boolean {
  return /block\s*ip|too many requests|封禁|频繁|rate.?limit/i.test(
    errorMessage(reason),
  );
}

function isPrimaryUserApiCircuitOpen(scriptId?: string | null): boolean {
  if (!scriptId) return false;
  if (sessionHardSkipScripts.has(scriptId)) return true;
  const until = primaryCircuitUntilByScript.get(scriptId) ?? 0;
  return Date.now() < until;
}

function notePrimaryUserApiFailure(
  scriptId?: string | null,
  reason?: unknown,
): void {
  if (!scriptId) return;
  const msg = errorMessage(reason);

  // IP 封禁 / 限流：立刻跳过本轮 + 长熔断（含活跃源），禁止换源矩阵继续请求该脚本
  if (isUserApiIpBanError(reason)) {
    sessionHardSkipScripts.add(scriptId);
    primaryCircuitUntilByScript.set(scriptId, Date.now() + 30 * 60_000);
    primaryFailStreakByScript.set(scriptId, 0);
    console.warn(
      '[user-api] IP-ban circuit opened 30min for script',
      scriptId,
      msg.slice(0, 40),
    );
    return;
  }

  // 硬失败（空消息 / 超时 / 连接失败等）：本轮跳过；活跃源不写持久熔断
  const hardFail =
    !msg.trim() ||
    /404|Not Found|ECONN|ETIMEDOUT|circuit|请求超时|get url error/i.test(msg);
  if (hardFail) {
    sessionHardSkipScripts.add(scriptId);
    if (isActiveUserApiId(scriptId)) {
      console.warn('[user-api] session skip active after hard fail', scriptId);
      return;
    }
  } else if (isActiveUserApiId(scriptId)) {
    return;
  }
  const streak = hardFail
    ? 3
    : (primaryFailStreakByScript.get(scriptId) ?? 0) + 1;
  primaryFailStreakByScript.set(scriptId, streak);
  if (streak >= 3) {
    primaryCircuitUntilByScript.set(scriptId, Date.now() + 5 * 60_000);
    primaryFailStreakByScript.set(scriptId, 0);
    console.warn(
      '[user-api] circuit opened 5min for script',
      scriptId,
      hardFail ? `(hard: ${msg.slice(0, 40) || 'empty'})` : '',
    );
  }
}

function notePrimaryUserApiSuccess(scriptId?: string | null): void {
  if (!scriptId) return;
  primaryFailStreakByScript.set(scriptId, 0);
  primaryCircuitUntilByScript.delete(scriptId);
  sessionHardSkipScripts.delete(scriptId);
}

export function resetPrimaryUserApiCircuit(): void {
  primaryFailStreakByScript.clear();
  primaryCircuitUntilByScript.clear();
  sessionHardSkipScripts.clear();
}

async function tryCachePlayback(
  track: AudioTrack,
  sourceUrl: string,
  bytes: ArrayBuffer,
  mime = 'audio/mpeg',
): Promise<void> {
  try {
    await cacheMusicTrackAudio(track.id, sourceUrl, bytes, mime);
  } catch {
    // 后台缓存失败不影响播放
  }
}

const USER_API_MUSIC_URL_TIMEOUT_MS = 20_000;
/** 非活跃源略短超时，尽快进入下一个脚本（通用策略，不绑定具体源） */
const USER_API_SIDE_TIMEOUT_MS = 12_000;

function musicUrlTimeoutMs(userApiId: string): number {
  return isActiveUserApiId(userApiId)
    ? USER_API_MUSIC_URL_TIMEOUT_MS
    : USER_API_SIDE_TIMEOUT_MS;
}

async function resolveUserApiUrl(
  userApiId: string,
  track: AudioTrack,
  quality?: MusicQuality,
): Promise<string | null> {
  if (isPrimaryUserApiCircuitOpen(userApiId)) {
    console.warn('[user-api] circuit open, skip', userApiId);
    return null;
  }
  const scriptMeta = listUserApiScripts().find((s) => s.id === userApiId);
  if (!scriptMeta?.enabled || scriptMeta.initStatus !== 'ready') {
    console.info('[user-api] skip non-ready source', userApiId);
    return null;
  }
  const timeoutMs = musicUrlTimeoutMs(userApiId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const result = await Promise.race([
      userApiMusicUrl(userApiId, track, undefined, quality ?? getPlayQuality(track)).finally(() => {
        if (timer) clearTimeout(timer);
      }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          console.warn('[user-api] musicUrl timeout', userApiId, `${timeoutMs}ms`);
          resolve(null);
        }, timeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (result) {
      notePrimaryUserApiSuccess(userApiId);
      return result;
    }
    notePrimaryUserApiFailure(
      userApiId,
      timedOut ? new Error('请求超时') : undefined,
    );
    return null;
  } catch (err) {
    if (timer) clearTimeout(timer);
    notePrimaryUserApiFailure(userApiId, err);
    console.warn('[user-api] musicUrl failed', userApiId, err);
    lastUserApiError = err;
    return null;
  }
}

let lastUserApiError: unknown = null;

/** 最近一次 UserApi 失败信息（供状态栏展示 VIP/付费等原因） */
export function consumeLastUserApiError(): unknown {
  const err = lastUserApiError;
  lastUserApiError = null;
  return err;
}

/**
 * 对齐 lx 换源 + Reader 多 UserApi：
 * 1) 原平台：按「活跃 → 其他启用」各试一次（旁路 VIP 源可在此命中）
 * 2) 原平台内置
 * 3) 跨平台（findMusic）：**仅当前活跃源**跟 lx 一样逐平台试；不要对每个旁路源再乘平台矩阵
 *    （否则一首歌会把公共代理打爆触发 block ip）
 * 4) 跨平台内置
 */
async function resolveAcrossUserApiAndPlatforms(
  track: AudioTrack,
  accept: (url: string, t: AudioTrack) => Promise<{ url: string; revoke: () => void } | null>,
  callbacks?: ToggleSourceCallbacks,
  cookies?: string,
  options?: { tryBuiltin?: boolean; quality?: MusicQuality },
): Promise<{
  playable: { url: string; revoke: () => void };
  track: AudioTrack;
  toggled: boolean;
} | null> {
  lastUserApiError = null;
  sessionHardSkipScripts.clear();
  const tryBuiltin = options?.tryBuiltin !== false;
  const ids = listUserApiScriptIdsForPlayback(isFallbackResolverEnabled());
  if (!ids.length && !tryBuiltin) {
    console.warn('[user-api] no enabled scripts for url resolve');
    return null;
  }
  const activeId = ids[0] ?? null;
  if (ids.length) {
    console.info(
      '[user-api] resolve order (active→others):',
      ids
        .map((id) => {
          const s = listUserApiScripts().find((x) => x.id === id);
          return s ? `${s.name}(${s.initStatus ?? '?'})` : id;
        })
        .join(' → '),
    );
  }

  const tryScriptOnTrack = async (
    scriptId: string,
    candidate: AudioTrack,
    tag: string,
  ): Promise<{ url: string; revoke: () => void } | null> => {
    const url = await resolveUserApiUrl(scriptId, candidate, options?.quality);
    if (!url) return null;
    const ok = await accept(url, candidate);
    if (ok) {
      console.info(`[user-api] musicUrl ok via ${scriptId}`, tag, candidate.source, candidate.name);
      return ok;
    }
    console.warn(`[user-api] rejected by validator via ${scriptId}`, tag, candidate.source);
    return null;
  };

  const tryBuiltinOnTrack = async (
    candidate: AudioTrack,
    tag: string,
  ): Promise<{ url: string; revoke: () => void } | null> => {
    if (!tryBuiltin) return null;
    callbacks?.onStatus?.(
      `${MusicPlaybackStatusText.gettingUrl}（内置 · ${candidate.source}）`,
    );
    const url = await tryResolveBuiltinUrl(candidate, cookies, options?.quality);
    if (!url) return null;
    const ok = await accept(url, candidate);
    if (ok) {
      console.info('[music] builtin url ok', tag, candidate.source);
      return ok;
    }
    return null;
  };

  // Phase 1：同平台换音源（活跃 → 其他启用，各一次）
  for (const scriptId of ids) {
    const scriptName =
      listUserApiScripts().find((x) => x.id === scriptId)?.name ?? scriptId;
    callbacks?.onStatus?.(
      `${MusicPlaybackStatusText.gettingUrl}（${scriptName} · ${track.source}）`,
    );
    console.info(
      '[user-api] try script same-platform',
      scriptName,
      track.source,
      track.name,
    );
    const hit = await tryScriptOnTrack(scriptId, track, 'same-platform');
    if (hit) return { playable: hit, track, toggled: false };
  }

  // Phase 1.5：同平台内置
  {
    const hit = await tryBuiltinOnTrack(track, 'same-platform');
    if (hit) return { playable: hit, track, toggled: false };
  }

  // Phase 2：对齐 lx — 仅活跃源跨平台（findMusic 每个候选只打活跃脚本一次）
  if (!isFallbackResolverEnabled()) return null;
  callbacks?.onStatus?.(MusicPlaybackStatusText.toggleTry);
  const others = await getOtherSourceTracks(track);
  if (!others.length) return null;

  if (activeId && !isPrimaryUserApiCircuitOpen(activeId)) {
    const activeName =
      listUserApiScripts().find((x) => x.id === activeId)?.name ?? activeId;
    for (const alt of others) {
      notifyToggleTry(alt, callbacks);
      console.info(
        '[user-api] try active script other-platform (lx-style)',
        activeName,
        alt.source,
        alt.name,
      );
      const hit = await tryScriptOnTrack(activeId, alt, 'other-platform');
      if (hit) return { playable: hit, track: alt, toggled: true };
      if (isPrimaryUserApiCircuitOpen(activeId)) {
        console.warn('[user-api] active script circuit open, stop platform toggle');
        break;
      }
    }
  }

  // Phase 2.5：跨平台仅内置（旁路 UserApi 不再乘平台）
  for (const alt of others) {
    notifyToggleTry(alt, callbacks);
    const builtinHit = await tryBuiltinOnTrack(alt, 'other-platform');
    if (builtinHit) return { playable: builtinHit, track: alt, toggled: true };
  }
  return null;
}

/**
 * 内置源：原平台 → findMusic 其它平台
 */
async function resolveBuiltinAcrossPlatforms(
  track: AudioTrack,
  accept: (url: string, t: AudioTrack) => Promise<{ url: string; revoke: () => void } | null>,
  cookies?: string,
  callbacks?: ToggleSourceCallbacks,
  cachedOthers?: AudioTrack[],
  quality?: MusicQuality,
): Promise<{
  playable: { url: string; revoke: () => void };
  track: AudioTrack;
  toggled: boolean;
} | null> {
  const primaryUrl = await tryResolveBuiltinUrl(track, cookies, quality);
  if (primaryUrl) {
    const ok = await accept(primaryUrl, track);
    if (ok) {
      console.info('[music] builtin url ok', track.source);
      return { playable: ok, track, toggled: false };
    }
  }

  if (!isFallbackResolverEnabled()) return null;
  const others =
    cachedOthers ??
    (await (async () => {
      callbacks?.onStatus?.(MusicPlaybackStatusText.toggleTry);
      return getOtherSourceTracks(track);
    })());
  for (const alt of others) {
    notifyToggleTry(alt, callbacks);
    const url = await tryResolveBuiltinUrl(alt, cookies, quality);
    if (!url) continue;
    const ok = await accept(url, alt);
    if (ok) {
      console.info('[music] builtin url ok after toggle', alt.source);
      return { playable: ok, track: alt, toggled: true };
    }
  }
  return null;
}

export async function resolveTrackPlaybackUrls(
  track: AudioTrack,
  options?: {
    cookies?: string;
    userApiId?: string;
    skipCache?: boolean;
    activeSource?: string | null;
    quality?: MusicQuality;
    /** false 时不走跨平台换源（用于已挂载的 toggleMusicInfo） */
    allowToggleSource?: boolean;
  } & ToggleSourceCallbacks,
): Promise<{
  urls: string[];
  revokeAll: () => void;
  toggled?: boolean;
  track?: AudioTrack;
}> {
  const offline = getMusicOfflineMode();
  const urlMode = getMusicSettings().urlSourceMode;
  const allowToggleSource = options?.allowToggleSource !== false;
  // options.userApiId / activeSource 仍保留兼容；取链统一按「活跃 → 其他启用 →（auto）内置」

  if (track.source === 'local') {
    const url = resolveLocalTrackUrl(track);
    return { urls: url ? [url] : [], revokeAll: () => {}, track };
  }

  // 离线模式是硬边界：即使调用方要求刷新，也只允许读取本地音频缓存。
  if (!options?.skipCache || offline) {
    const cached = await getCachedMusicTrackByTrackId(track.id);
    if (cached) {
      const blobUrl = createAudioObjectUrl(cached.bytes, cached.mime);
      return {
        urls: [blobUrl],
        revokeAll: () => URL.revokeObjectURL(blobUrl),
        track,
      };
    }
  }

  if (offline) {
    return { urls: [], revokeAll: () => {}, track };
  }

  // 对齐 lx：已有 toggleMusicInfo 时优先用其取链（不再二次换源）
  if (allowToggleSource) {
    const toggleInfo = getToggleMusicInfo(track);
    if (toggleInfo) {
      const cleanToggle: AudioTrack = {
        ...toggleInfo,
        meta: { ...toggleInfo.meta, toggleMusicInfo: undefined },
      };
      const fromToggle = await resolveTrackPlaybackUrls(cleanToggle, {
        ...options,
        allowToggleSource: false,
      });
      if (fromToggle.urls.length > 0) {
        return { ...fromToggle, toggled: true, track: toggleInfo };
      }
      // 换源曲目失效则回退原曲并允许再次换源
    }
  }

  const activeName = getActiveUserApiDisplayName();
  options?.onStatus?.(
    activeName
      ? `${MusicPlaybackStatusText.gettingUrl}（${activeName}）`
      : MusicPlaybackStatusText.gettingUrl,
  );

  let playable: { url: string; revoke: () => void } | null = null;

  const acceptUrl = async (
    candidateUrl: string,
    candidateTrack: AudioTrack,
  ): Promise<{ url: string; revoke: () => void } | null> => {
    if (/bitrate\$1(?:&|$)/i.test(candidateUrl)) {
      console.warn('[music] reject kuwo stub url', candidateUrl.slice(0, 80));
      return null;
    }
    if (!candidateUrl.startsWith('http')) {
      const direct = { url: candidateUrl, revoke: () => {} };
      playable = direct;
      return direct;
    }
    const materialized = await materializePlayableUrl(
      candidateUrl,
      candidateTrack,
      options?.cookies,
    );
    if (!materialized) return null;
    playable = materialized;
    return materialized;
  };

  const acceptUrlValidator = async (url: string, t: AudioTrack) =>
    (await acceptUrl(url, t)) !== null;

  /**
   * 活跃→其他 UserApi；auto 模式下同平台/跨平台穿插内置，避免矩阵拖死。
   * builtin 模式纯走内置矩阵。
   * allowToggleSource=false：仅同平台取链，不 findMusic 跨平台（用于 toggleMusicInfo）。
   */
  let resolved: {
    playable: { url: string; revoke: () => void };
    track: AudioTrack;
    toggled: boolean;
  } | null = null;

  if (!allowToggleSource) {
    // 仅打当前曲目所属源
    const ids = listUserApiScriptIdsForPlayback(isFallbackResolverEnabled());
    for (const scriptId of ids) {
      const url = await resolveUserApiUrl(scriptId, track, options?.quality);
      if (!url) continue;
      const ok = await acceptUrl(url, track);
      if (ok) {
        resolved = { playable: ok, track, toggled: false };
        break;
      }
    }
    if (!resolved && urlMode !== 'userApi') {
      const url = await tryResolveBuiltinUrl(track, options?.cookies, options?.quality);
      if (url) {
        const ok = await acceptUrl(url, track);
        if (ok) resolved = { playable: ok, track, toggled: false };
      }
    }
  } else if (urlMode === 'builtin') {
    resolved = await resolveBuiltinAcrossPlatforms(
      track,
      acceptUrl,
      options?.cookies,
      {
        onStatus: options?.onStatus,
        onToggleSource: options?.onToggleSource,
      },
      undefined,
      options?.quality,
    );
  } else {
    resolved = await resolveAcrossUserApiAndPlatforms(
      track,
      acceptUrl,
      {
        onStatus: options?.onStatus,
        onToggleSource: options?.onToggleSource,
      },
      options?.cookies,
      { tryBuiltin: urlMode === 'auto', quality: options?.quality },
    );
  }

  if (!resolved && allowToggleSource && urlMode !== 'userApi') {
    const last = await resolveLastResortTrackUrl(
      track,
      async (alt) => {
        const url = await tryResolveBuiltinUrl(alt, options?.cookies, options?.quality);
        if (!url) return null;
        if (!(await acceptUrlValidator(url, alt))) return null;
        return { url, track: alt };
      },
      {
        onStatus: options?.onStatus,
        onToggleSource: options?.onToggleSource,
      },
    );
    if (last) {
      const resolvedPlayable =
        playable ?? (await acceptUrl(last.url, last.track));
      if (resolvedPlayable) {
        resolved = {
          playable: resolvedPlayable,
          track: last.track,
          toggled: true,
        };
      }
    }
  } else if (!resolved && allowToggleSource && urlMode === 'userApi' && isFallbackResolverEnabled()) {
    // 仅 UserApi：关键词候选也只喂活跃源（对齐 lx，避免再乘旁路脚本）
    const activeId = listEnabledUserApiScriptIdsForUrl()[0];
    const last = await resolveLastResortTrackUrl(
      track,
      async (alt) => {
        if (!activeId || isPrimaryUserApiCircuitOpen(activeId)) return null;
        notifyToggleTry(alt, {
          onStatus: options?.onStatus,
          onToggleSource: options?.onToggleSource,
        });
        const url = await resolveUserApiUrl(activeId, alt, options?.quality);
        if (!url) return null;
        if (!(await acceptUrlValidator(url, alt))) return null;
        return { url, track: alt };
      },
      {
        onStatus: options?.onStatus,
        onToggleSource: options?.onToggleSource,
      },
    );
    if (last) {
      const resolvedPlayable =
        playable ?? (await acceptUrl(last.url, last.track));
      if (resolvedPlayable) {
        resolved = {
          playable: resolvedPlayable,
          track: last.track,
          toggled: true,
        };
      }
    }
  }

  options?.onStatus?.(null);

  if (resolved) {
    return {
      urls: [resolved.playable.url],
      revokeAll: resolved.playable.revoke,
      toggled: resolved.toggled,
      track: resolved.track,
    };
  }

  return { urls: [], revokeAll: () => {}, toggled: true, track };
}

function parseTrackDurationSec(duration: string | undefined): number {
  if (!duration) return 0;
  const parts = duration.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  let sec = 0;
  let unit = 1;
  while (parts.length) {
    sec += (parts.pop() ?? 0) * unit;
    unit *= 60;
  }
  return sec;
}

async function materializePlayableUrl(
  url: string,
  track: AudioTrack,
  cookies?: string,
): Promise<{ url: string; revoke: () => void } | null> {
  if (/bitrate\$1(?:&|$)/i.test(url)) {
    console.warn('[music] skip kuwo stub audio', url.slice(0, 80));
    return null;
  }
  try {
    const headers: Record<string, string> = {};
    if (cookies) headers.Cookie = cookies;
    // 酷我 / QQ / 咪咕 CDN 常要求 Referer
    if (/kuwo\.cn/i.test(url)) headers.Referer = 'https://www.kuwo.cn/';
    else if (/qqmusic\.qq\.com|y\.qq\.com/i.test(url)) headers.Referer = 'https://y.qq.com/';
    else if (/migu\.cn|nf\.migu/i.test(url)) headers.Referer = 'https://music.migu.cn/';
    else if (/music\.126\.net|163\.com/i.test(url)) headers.Referer = 'https://music.163.com/';

    const res = await request(url, {
      method: 'GET',
      headers,
      timeout: 120_000,
      useBackendHttp: isTauri(),
      ignorePageNavigationAbort: true,
      allowNon2xx: true,
    });
    if (!res.ok) {
      // CDN 偶发 503：回退直链，WebView <audio> 常仍可播
      console.warn('[music] materialize HTTP', res.status, 'fallback to direct url');
      return { url, revoke: () => {} };
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 8_192) {
      console.warn('[music] audio too small', buf.byteLength, url.slice(0, 60));
      return null;
    }
    // VIP 试听片段通常远小于整曲；按时长粗估拒绝过短内容（约 <64kbps 整曲）
    const dur = parseTrackDurationSec(track.duration);
    if (dur >= 60) {
      const minBytes = Math.floor(dur * 8_000);
      if (buf.byteLength < minBytes) {
        console.warn(
          '[music] audio looks like preview fragment',
          { bytes: buf.byteLength, minBytes, dur, url: url.slice(0, 60) },
        );
        return null;
      }
    }
    const mime =
      (typeof res.headers['content-type'] === 'string' && res.headers['content-type']) ||
      'audio/mpeg';
    void tryCachePlayback(track, url, buf, mime);
    const blobUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
    return { url: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) };
  } catch (err) {
    console.warn('[music] materialize playable url failed, fallback direct', url.slice(0, 80), err);
    // 网络抖动时仍尝试直链播放
    if (/^https?:\/\//i.test(url) && !/bitrate\$1(?:&|$)/i.test(url)) {
      return { url, revoke: () => {} };
    }
    return null;
  }
}

/** 主动缓存当前曲目到本地 */
export async function cacheTrackForOffline(
  track: AudioTrack,
  options?: { cookies?: string; userApiId?: string; activeSource?: string | null },
): Promise<boolean> {
  const { urls } = await resolveTrackPlaybackUrls(track, {
    ...options,
    skipCache: true,
  });
  const url = urls[0];
  if (!url) return false;
  if (url.startsWith('blob:')) {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    await cacheMusicTrackAudio(track.id, url, buf);
    return true;
  }
  const res = await request(url, {
    headers: options?.cookies ? { Cookie: options.cookies } : undefined,
  });
  if (!res.ok) return false;
  const buf = await res.arrayBuffer();
  await cacheMusicTrackAudio(track.id, url, buf);
  return true;
}

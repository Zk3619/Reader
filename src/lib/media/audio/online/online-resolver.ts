/**
 * 统一在线/本地曲目 URL 解析
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { resolveLocalTrackUrlAsync } from '@/lib/media/audio/library/local-resolver';
import {
  userApiMusicUrl,
  isActiveUserApiId,
  listEnabledUserApiScriptIdsForUrl,
  listUserApiScriptIdsForPlayback,
  listUserApiScripts,
  getActiveUserApiDisplayName,
} from '@/lib/media/audio/online/user-api-engine';
import { getMusicOfflineMode } from '@/lib/media/audio/online/user-api-settings';
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
  notifyToggleTry,
  isFallbackResolverEnabled,
  type ToggleSourceCallbacks,
} from '@/lib/media/audio/platform/fallback-resolver';
import { MusicPlaybackStatusText } from '@/lib/media/audio/music-playback-status';
import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';
import { getToggleMusicInfo } from '@/lib/media/audio/track-toggle';
import { isMfSourceKey, parseMfPluginId } from '@/lib/media/audio/online/mf-plugin/types';
import { isPlatformSource } from '@/lib/media/audio/platform/platform-sources';

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
  tier: 'auto' | 'manual' = 'auto',
  /** 列表曲目 id；换源取链时仍写入原曲，避免索引挂在备用源 id */
  cacheTrackId?: string,
): Promise<void> {
  const id = (cacheTrackId?.trim() || track.id).trim();
  try {
    await cacheMusicTrackAudio(id, sourceUrl, bytes, mime, { tier });
    console.info('[music-cache] wrote', id.slice(0, 40), `${bytes.byteLength}B`, tier);
  } catch (err) {
    console.warn('[music-cache] write failed', id.slice(0, 40), err);
  }
}

/**
 * 经后端/HTTP 拉整曲为 blob。
 * 播放走 WebAudio MediaElementSource 时，跨域且无 ACAO 的直链会输出全零静音；
 * blob: 同源，可正常出声，并顺带写入 auto 缓存。
 */
async function materializeRemoteAudioToBlob(
  track: AudioTrack,
  url: string,
  cookies?: string,
  timeoutMs = PROXY_MATERIALIZE_TIMEOUT_MS,
  cacheTrackId?: string,
  opts?: { allowCache?: boolean; rejectPreviewBySize?: boolean },
): Promise<{ url: string; revoke: () => void } | null> {
  try {
    const headers = playbackFetchHeaders(url, cookies);
    const res = await request(url, {
      method: 'GET',
      headers,
      timeout: timeoutMs,
      useBackendHttp: isTauri(),
      ignorePageNavigationAbort: true,
      allowNon2xx: true,
    });
    if (!res.ok && res.status !== 206) {
      console.warn('[music] materialize HTTP', res.status, url.slice(0, 80));
      return null;
    }
    const buf = await res.arrayBuffer();
    const mime =
      (typeof res.headers['content-type'] === 'string' && res.headers['content-type']) ||
      'audio/mpeg';
    if (looksLikeErrorPayload(buf, mime)) {
      console.warn('[music] materialize got non-audio body, reject', mime.slice(0, 40));
      return null;
    }
    if (buf.byteLength < 8_192 && !looksLikeAudioBytes(buf)) {
      console.warn('[music] audio too small, reject', buf.byteLength, url.slice(0, 60));
      return null;
    }
    const rejectPreviewBySize = opts?.rejectPreviewBySize !== false;
    const dur = parseTrackDurationSec(track.duration);
    if (rejectPreviewBySize && dur >= 60) {
      const minBytes = Math.floor(dur * 8_000);
      if (buf.byteLength < minBytes) {
        console.warn('[music] audio looks like preview fragment', {
          bytes: buf.byteLength,
          minBytes,
          dur,
          url: url.slice(0, 60),
        });
        return null;
      }
    }
    if (opts?.allowCache !== false) {
      void tryCachePlayback(track, url, buf, mime, 'auto', cacheTrackId);
    }
    const blobUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
    return { url: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) };
  } catch (err) {
    console.warn('[music] materialize to blob failed', url.slice(0, 80), err);
    return null;
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
 * 1) 原平台：按「活跃 → 其他启用」各试一次
 * 2) 跨平台（findMusic）：仅当前活跃源逐平台试
 * 内置五源 musicUrl 已移除（对齐 LX 2023-10 后），不再 tryBuiltin。
 */
async function resolveAcrossUserApiAndPlatforms(
  track: AudioTrack,
  accept: (url: string, t: AudioTrack) => Promise<{ url: string; revoke: () => void } | null>,
  callbacks?: ToggleSourceCallbacks,
  _cookies?: string,
  options?: { quality?: MusicQuality },
): Promise<{
  playable: { url: string; revoke: () => void };
  track: AudioTrack;
  toggled: boolean;
} | null> {
  lastUserApiError = null;
  sessionHardSkipScripts.clear();
  const ids = listUserApiScriptIdsForPlayback(isFallbackResolverEnabled());
  if (!ids.length) {
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

  // Phase 2：对齐 lx — 仅活跃源跨平台
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

  return null;
}

type LocalPlaybackIntent = 'library' | 'download' | 'file-meta';

async function tryResolveLocalFilePlayback(
  track: AudioTrack,
  options?: {
    preferDownloadedFile?: boolean;
    intent?: LocalPlaybackIntent;
  },
): Promise<{
  urls: string[];
  revokeAll: () => void;
  track: AudioTrack;
  playbackVia: 'local-file';
} | null> {
  let localPath =
    typeof track.meta.filePath === 'string' && track.meta.filePath.trim()
      ? track.meta.filePath.trim()
      : '';

  const wantsLocal =
    track.source === 'local' ||
    (track.source !== 'webdav' &&
      (options?.preferDownloadedFile === true || !!localPath));

  if (
    !localPath &&
    track.source !== 'webdav' &&
    (options?.preferDownloadedFile || track.source === 'local')
  ) {
    try {
      const { getCompletedDownloadPath } = await import('@/lib/media/audio/audio-download');
      localPath = (await getCompletedDownloadPath(track.id)) ?? '';
    } catch {
      localPath = '';
    }
  }

  if (!localPath) {
    if (wantsLocal) {
      console.warn('[music-local] no local path', {
        trackId: track.id,
        source: track.source,
        intent: options?.intent ?? (options?.preferDownloadedFile ? 'download' : 'library'),
      });
    }
    return null;
  }

  console.info('[music-local] resolve start', {
    trackId: track.id,
    source: track.source,
    intent: options?.intent ?? (options?.preferDownloadedFile ? 'download' : 'library'),
    path: localPath.length > 96 ? `${localPath.slice(0, 96)}…` : localPath,
  });

  const { url, revoke } = await resolveLocalTrackUrlAsync({
    ...track,
    meta: { ...track.meta, filePath: localPath },
  });

  if (!url) {
    console.warn('[music-local] resolve failed (empty url)', {
      trackId: track.id,
      path: localPath,
    });
    return null;
  }

  console.info('[music-local] resolve ok', {
    trackId: track.id,
    urlKind: url.startsWith('blob:') ? 'blob' : url.startsWith('http://asset.') ? 'asset' : 'other',
  });

  return {
    urls: [url],
    revokeAll: revoke,
    track: { ...track, meta: { ...track.meta, filePath: localPath } },
    playbackVia: 'local-file',
  };
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
    /** 下载列表播放：优先用户目录已完成文件（不依赖 UserApi） */
    preferDownloadedFile?: boolean;
    /**
     * 磁盘缓存主键。换源取链时传入列表曲目 id，
     * 避免文件/索引挂在备用源 id（如 kw__xxx）上而列表仍是 wy__xxx。
     */
    cacheTrackId?: string;
  } & ToggleSourceCallbacks,
): Promise<{
  urls: string[];
  revokeAll: () => void;
  toggled?: boolean;
  track?: AudioTrack;
  playbackVia?: 'local-file' | 'cache' | 'remote';
  /** 最终播放的是试听片段（完整曲不可得） */
  isPreview?: boolean;
  notice?: string;
}> {
  const offline = getMusicOfflineMode();
  const allowToggleSource = options?.allowToggleSource !== false;
  const cacheTrackId = (options?.cacheTrackId?.trim() || track.id).trim();
  // 取链：仅 UserApi（+ 上方 MF / 本地 / 缓存）；无内置五源 musicUrl

  const localPlayback = await tryResolveLocalFilePlayback(track, {
    preferDownloadedFile: options?.preferDownloadedFile,
    intent:
      track.source === 'local'
        ? 'library'
        : options?.preferDownloadedFile
          ? 'download'
          : 'file-meta',
  });
  if (localPlayback) {
    let playTrack = localPlayback.track;
    if (track.source === 'local') {
      try {
        const { enrichLocalTrackOnlineMeta } = await import(
          '@/lib/media/audio/library/local-online-match'
        );
        playTrack = await enrichLocalTrackOnlineMeta(localPlayback.track);
      } catch {
        playTrack = localPlayback.track;
      }
    }
    return {
      urls: localPlayback.urls,
      revokeAll: localPlayback.revokeAll,
      track: playTrack,
      playbackVia: localPlayback.playbackVia,
    };
  }

  // WebDAV 远程曲库
  if (track.source === 'webdav' || track.meta.webdavPath) {
    try {
      const { resolveWebDavTrackPlayback } = await import(
        '@/lib/media/audio/library/webdav-remote-list'
      );
      const remote = await resolveWebDavTrackPlayback(track);
      if (remote?.urls.length) {
        return {
          urls: remote.urls,
          revokeAll: remote.revokeAll,
          track,
          playbackVia: 'remote',
        };
      }
    } catch (err) {
      console.warn('[webdav-remote] resolve failed', err);
    }
  }

  const requiresLocalOnly =
    track.source === 'local' || options?.preferDownloadedFile === true;
  if (requiresLocalOnly) {
    console.warn('[music-local] local playback required but unavailable', {
      trackId: track.id,
      source: track.source,
      preferDownloadedFile: options?.preferDownloadedFile === true,
    });
    return { urls: [], revokeAll: () => {}, track, playbackVia: 'local-file' };
  }

  // 离线模式是硬边界：即使调用方要求刷新，也只允许读取本地音频缓存。
  if (!options?.skipCache || offline) {
    let cached = await getCachedMusicTrackByTrackId(cacheTrackId);
    // 历史缺口：换源曾把文件写在备用源 id 下
    if (!cached && cacheTrackId !== track.id) {
      cached = await getCachedMusicTrackByTrackId(track.id);
    }
    if (!cached) {
      const toggleInfo = getToggleMusicInfo(track);
      if (toggleInfo?.id && toggleInfo.id !== cacheTrackId) {
        cached = await getCachedMusicTrackByTrackId(toggleInfo.id);
      }
    }
    if (cached) {
      // 拒绝历史误缓存的试听碎片（时长不固定，按元数据时长估最小体积）
      const cachedDur = parseTrackDurationSec(track.duration);
      if (cachedDur >= 60) {
        const minBytes = Math.floor(cachedDur * 8_000);
        if (cached.bytes.byteLength < minBytes) {
          console.warn('[music-cache] reject preview-sized cache hit', {
            bytes: cached.bytes.byteLength,
            minBytes,
            dur: cachedDur,
            trackId: cacheTrackId.slice(0, 40),
          });
          cached = null;
        }
      }
    }
    if (cached) {
      console.info(
        '[music-cache] hit',
        cacheTrackId.slice(0, 40),
        cached.cacheTier,
        `${cached.bytes.byteLength}B`,
      );
      // 命中磁盘缓存：回填 DB 索引，并刷新列表「已缓存」徽标
      try {
        const {
          updateAudioTrackCacheMeta,
          audioTrackNeedsCacheIndexBackfill,
          patchTrackInGroupTracksCaches,
        } = await import('@/lib/database/audio-library');
        let rel = cached.cachePath?.trim() ?? '';
        if (await audioTrackNeedsCacheIndexBackfill(cacheTrackId)) {
          if (!rel && track.id !== cacheTrackId) {
            const alt = await getCachedMusicTrackByTrackId(track.id);
            rel = alt?.cachePath?.trim() ?? '';
          }
          if (!rel) {
            const toggleInfo = getToggleMusicInfo(track);
            if (toggleInfo?.id) {
              const alt = await getCachedMusicTrackByTrackId(toggleInfo.id);
              rel = alt?.cachePath?.trim() ?? '';
            }
          }
          if (rel) {
            await updateAudioTrackCacheMeta(cacheTrackId, {
              cachePath: rel,
              cacheTier: cached.cacheTier,
              cachedAt: Date.now(),
              cacheBytes: cached.bytes.byteLength,
              cacheMime: cached.mime,
            });
          }
        }
        patchTrackInGroupTracksCaches(cacheTrackId, {
          meta: {
            cacheTier: cached.cacheTier,
            ...(rel ? { cachePath: rel } : {}),
          },
        });
      } catch {
        /* ignore */
      }
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
        cacheTrackId,
      });
      if (fromToggle.urls.length > 0) {
        return { ...fromToggle, toggled: true, track: toggleInfo };
      }
      // 换源曲目失效则回退原曲并允许再次换源
    }
  }

  // 账号平台源：本源直连取流（不经 UserApi / 五源矩阵）
  if (isPlatformSource(String(track.source))) {
    const platformLabel =
      track.source === 'netease'
        ? '网易云音乐'
        : track.source === 'bili'
          ? '哔哩哔哩'
          : 'YouTube Music';
    options?.onStatus?.(`${MusicPlaybackStatusText.gettingUrl}（${platformLabel}）`);
    try {
      const { resolvePlatformStream, platformPlaybackCookies } = await import(
        '@/lib/media/audio/platform/stream-resolver'
      );
      const stream = await resolvePlatformStream(track, {
        skipCache: options?.skipCache,
        quality: options?.quality,
      });

      const playPlatformStream = async (
        streamResult: NonNullable<typeof stream>,
        playTrack: AudioTrack,
        opts?: { allowCache?: boolean },
      ): Promise<{
        urls: string[];
        revokeAll: () => void;
        track: AudioTrack;
        playbackVia: 'remote';
        isPreview?: boolean;
        notice?: string;
      } | null> => {
        const url = streamResult.url.trim();
        if (!url) return null;
        const allowCache = opts?.allowCache !== false && !streamResult.isPreview;
        const cookie = await platformPlaybackCookies(playTrack);
        const headers: Record<string, string> = {
          ...(streamResult.headers ?? {}),
          ...(cookie ? { Cookie: cookie } : {}),
        };
        if (Object.keys(headers).length > 0) {
          try {
            const { buildMfProxyPlayUrl } = await import(
              '@/lib/media/audio/online/mf-plugin/request-forwarder'
            );
            const proxyUrl = await buildMfProxyPlayUrl(url, headers);
            if (proxyUrl) {
              if (allowCache) {
                void backgroundCacheMfMediaWithHeaders(url, playTrack, headers, cacheTrackId);
              }
              return {
                urls: [proxyUrl],
                revokeAll: () => {},
                track: playTrack,
                playbackVia: 'remote',
                isPreview: streamResult.isPreview === true,
                notice: streamResult.isPreview
                  ? MusicPlaybackStatusText.previewOnly
                  : undefined,
              };
            }
          } catch (err) {
            console.warn('[music-platform] request-forwarder failed', err);
          }
          const materialized = await materializePlayableUrlWithHeaders(
            url,
            playTrack,
            headers,
            cacheTrackId,
            { allowCache },
          );
          if (materialized) {
            return {
              urls: [materialized.url],
              revokeAll: materialized.revoke,
              track: playTrack,
              playbackVia: 'remote',
              isPreview: streamResult.isPreview === true,
              notice: streamResult.isPreview
                ? MusicPlaybackStatusText.previewOnly
                : undefined,
            };
          }
        }
        const plain = await materializePlayableUrl(
          url,
          playTrack,
          cookie ?? options?.cookies,
          cacheTrackId,
          { allowCache, rejectPreviewBySize: !streamResult.isPreview },
        );
        if (plain) {
          return {
            urls: [plain.url],
            revokeAll: plain.revoke,
            track: playTrack,
            playbackVia: 'remote',
            isPreview: streamResult.isPreview === true,
            notice: streamResult.isPreview
              ? MusicPlaybackStatusText.previewOnly
              : undefined,
          };
        }
        if (!url.startsWith('http')) {
          return {
            urls: [url],
            revokeAll: () => {},
            track: playTrack,
            playbackVia: 'remote',
            isPreview: streamResult.isPreview === true,
          };
        }
        return null;
      };

      // 完整曲：直接播
      if (stream?.url?.trim() && !stream.isPreview) {
        const played = await playPlatformStream(stream, track);
        if (played) {
          options?.onStatus?.(null);
          return played;
        }
      }

      // 仅试听或取链失败：跨源匹配 UserApi → MF → B站
      const previewStream =
        stream?.url?.trim() && stream.isPreview ? stream : null;
      if (allowToggleSource && isFallbackResolverEnabled()) {
        const { resolvePlatformPreviewFallback } = await import(
          '@/lib/media/audio/platform/preview-fallback'
        );
        const acceptUrl = async (
          candidateUrl: string,
          candidateTrack: AudioTrack,
        ): Promise<{ url: string; revoke: () => void } | null> => {
          if (/bitrate\$1(?:&|$)/i.test(candidateUrl)) return null;
          if (!candidateUrl.startsWith('http')) {
            return { url: candidateUrl, revoke: () => {} };
          }
          return materializePlayableUrl(
            candidateUrl,
            candidateTrack,
            options?.cookies,
            cacheTrackId,
          );
        };
        const alt = await resolvePlatformPreviewFallback(
          track,
          acceptUrl,
          {
            onStatus: options?.onStatus,
            onToggleSource: options?.onToggleSource,
          },
          {
            quality: options?.quality,
            resolveUserApiUrl,
            isUserApiCircuitOpen: isPrimaryUserApiCircuitOpen,
          },
        );
        if (alt) {
          options?.onStatus?.(null);
          return {
            urls: [alt.playable.url],
            revokeAll: alt.playable.revoke,
            toggled: true,
            track: alt.track,
            playbackVia: 'remote',
          };
        }
      }

      // 无完整替代：最后才播试听（不缓存）
      if (previewStream) {
        console.warn('[music-platform] playing preview clip as last resort', track.name);
        const played = await playPlatformStream(previewStream, track, { allowCache: false });
        if (played) {
          options?.onStatus?.(played.notice ?? null);
          return played;
        }
      }

      if (!stream?.url?.trim()) {
        console.warn('[music-platform] empty stream url', track.source);
      }
    } catch (err) {
      console.warn('[music-platform] resolve failed', track.source, err);
    }
    options?.onStatus?.(null);
    return { urls: [], revokeAll: () => {}, track };
  }

  // MusicFree 辅源：仅走本插件 getMediaSource（不进 LX UserApi / 五源矩阵）
  if (isMfSourceKey(String(track.source))) {
    const pluginId =
      parseMfPluginId(String(track.source)) ||
      (typeof track.meta.mfPluginId === 'string' ? track.meta.mfPluginId : null);
    if (!pluginId) {
      return { urls: [], revokeAll: () => {}, track };
    }
    try {
      const { mfGetMediaSource, mfPluginDisplayLabel, getMfPlugin } = await import(
        '@/lib/media/audio/online/mf-plugin'
      );
      const cacheControl = getMfPlugin(pluginId)?.cacheControl ?? 'cache';
      const urlCacheId = cacheTrackId ?? track.id;
      options?.onStatus?.(
        `${MusicPlaybackStatusText.gettingUrl}（${mfPluginDisplayLabel(pluginId)}）`,
      );
      let media: Awaited<ReturnType<typeof mfGetMediaSource>> = null;
      if (cacheControl === 'cache') {
        const { getCachedTrackUrl } = await import('@/lib/database/audio-library');
        const cachedUrl = await getCachedTrackUrl(urlCacheId);
        if (cachedUrl) {
          media = { url: cachedUrl };
        }
      }
      if (!media?.url) {
        media = await mfGetMediaSource(pluginId, track, options?.quality);
        const rawUrl = media?.url?.trim();
        if (rawUrl && cacheControl !== 'no-store') {
          const { cacheTrackUrl } = await import('@/lib/database/audio-library');
          void cacheTrackUrl(urlCacheId, rawUrl);
        }
      }
      const url = media?.url?.trim();
      if (!url) {
        console.warn('[music-mf] empty media url', pluginId);
        return { urls: [], revokeAll: () => {}, track };
      }
      if (media?.headers && Object.keys(media.headers).length > 0) {
        const headers = {
          ...media.headers,
          ...(media.userAgent ? { 'User-Agent': media.userAgent } : {}),
        };
        // Tauri：优先本机 RequestForwarder 端口（对齐 Desktop，支持 seek / 不全量缓冲）
        try {
          const { buildMfProxyPlayUrl } = await import(
            '@/lib/media/audio/online/mf-plugin/request-forwarder'
          );
          const proxyUrl = await buildMfProxyPlayUrl(url, headers);
          if (proxyUrl) {
            // 代理直连不缓冲整曲：后台物化写入 auto 缓存，供徽标 / 离线命中
            if (cacheControl !== 'no-store') {
              void backgroundCacheMfMediaWithHeaders(
                url,
                track,
                headers,
                cacheTrackId,
              );
            }
            return {
              urls: [proxyUrl],
              revokeAll: () => {},
              track,
              playbackVia: 'remote',
            };
          }
        } catch (err) {
          console.warn('[music-mf] request-forwarder failed, fallback materialize', err);
        }
        // Web / 代理不可用：经主程序 request 物化为 blob
        const materialized = await materializePlayableUrlWithHeaders(
          url,
          track,
          headers,
          cacheTrackId,
        );
        if (materialized) {
          return {
            urls: [materialized.url],
            revokeAll: materialized.revoke,
            track,
            playbackVia: 'remote',
          };
        }
        console.warn(
          '[music-mf] header stream materialize failed, try plain url',
          pluginId,
        );
      }
      const plain = await materializePlayableUrl(
        url,
        track,
        options?.cookies,
        cacheTrackId,
      );
      if (plain) {
        return {
          urls: [plain.url],
          revokeAll: plain.revoke,
          track,
          playbackVia: 'remote',
        };
      }
      if (!url.startsWith('http')) {
        return {
          urls: [url],
          revokeAll: () => {},
          track,
          playbackVia: 'remote',
        };
      }
    } catch (err) {
      console.warn('[music-mf] resolve failed', pluginId, err);
    }
    return { urls: [], revokeAll: () => {}, track };
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
    // 换源候选：若备用源 id 已有磁盘缓存，直接复用并回填到列表曲目
    if (candidateTrack.id !== cacheTrackId) {
      const altCached = await getCachedMusicTrackByTrackId(candidateTrack.id);
      if (altCached) {
        try {
          const { updateAudioTrackCacheMeta, audioTrackNeedsCacheIndexBackfill } = await import(
            '@/lib/database/audio-library'
          );
          if (
            altCached.cachePath &&
            (await audioTrackNeedsCacheIndexBackfill(cacheTrackId))
          ) {
            await updateAudioTrackCacheMeta(cacheTrackId, {
              cachePath: altCached.cachePath,
              cacheTier: altCached.cacheTier,
              cachedAt: Date.now(),
              cacheBytes: altCached.bytes.byteLength,
              cacheMime: altCached.mime,
            });
          }
        } catch {
          /* ignore */
        }
        const blobUrl = createAudioObjectUrl(altCached.bytes, altCached.mime);
        const direct = { url: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) };
        playable = direct;
        return direct;
      }
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
      cacheTrackId,
    );
    if (!materialized) return null;
    playable = materialized;
    return materialized;
  };

  const acceptUrlValidator = async (url: string, t: AudioTrack) =>
    (await acceptUrl(url, t)) !== null;

  /**
   * 活跃→其他 UserApi；无内置取链（对齐 LX）。
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
  } else {
    resolved = await resolveAcrossUserApiAndPlatforms(
      track,
      acceptUrl,
      {
        onStatus: options?.onStatus,
        onToggleSource: options?.onToggleSource,
      },
      options?.cookies,
      { quality: options?.quality },
    );
  }

  if (!resolved && allowToggleSource && isFallbackResolverEnabled()) {
    // 关键词候选只喂活跃源（对齐 lx）
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

/** 物化整曲上限：超时则改走探测后再后端拉 blob（禁止无 CORS 直链进 WebAudio） */
const MATERIALIZE_TIMEOUT_MS = 12_000;
/** 代理链整曲物化：文件较大，单独放宽 */
const PROXY_MATERIALIZE_TIMEOUT_MS = 180_000;
/** 代理链轻量探测：只拉前几 KB 校验是否真是音频 */
const AUDIO_PROBE_TIMEOUT_MS = 8_000;
const AUDIO_PROBE_BYTES = 16_384;

/**
 * 长青等 PHP 代理：整曲物化易挂起，改为 Range 探测后直连播放。
 */
function isProxyStylePlayUrl(url: string): boolean {
  if (/\/(?:wy|kw|kg|tx|mg|xm)\d*\/[^/?#]+\.php\?/i.test(url)) return true;
  if (/\.php(?:\?|$)/i.test(url) && /[?&](?:type=mp3|id=|level=)/i.test(url)) return true;
  return false;
}

function playbackFetchHeaders(url: string, cookies?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (cookies) headers.Cookie = cookies;
  if (/kuwo\.cn/i.test(url)) headers.Referer = 'https://www.kuwo.cn/';
  else if (/qqmusic\.qq\.com|y\.qq\.com/i.test(url)) headers.Referer = 'https://y.qq.com/';
  else if (/migu\.cn|nf\.migu/i.test(url)) headers.Referer = 'https://music.migu.cn/';
  else if (/music\.126\.net|163\.com/i.test(url)) headers.Referer = 'https://music.163.com/';
  else if (/bilivideo\.|bilibili\.com/i.test(url)) headers.Referer = 'https://www.bilibili.com/';
  else if (/googlevideo\.com|youtube\.com/i.test(url)) {
    headers.Referer = 'https://music.youtube.com/';
    headers.Origin = 'https://music.youtube.com';
  }
  return headers;
}

/** 常见音频容器 / 帧头魔数 */
function looksLikeAudioBytes(buf: ArrayBuffer): boolean {
  const u8 = new Uint8Array(buf);
  if (u8.length < 4) return false;
  // ID3 tag (mp3)
  if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) return true;
  // MPEG frame sync
  if (u8[0] === 0xff && (u8[1]! & 0xe0) === 0xe0) return true;
  // fLaC
  if (u8[0] === 0x66 && u8[1] === 0x4c && u8[2] === 0x61 && u8[3] === 0x43) return true;
  // OggS
  if (u8[0] === 0x4f && u8[1] === 0x67 && u8[2] === 0x67 && u8[3] === 0x53) return true;
  // ....ftyp (m4a / mp4)
  if (u8.length >= 8 && u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) {
    return true;
  }
  // RIFF....WAVE
  if (
    u8[0] === 0x52 &&
    u8[1] === 0x49 &&
    u8[2] === 0x46 &&
    u8[3] === 0x46 &&
    u8.length >= 12 &&
    u8[8] === 0x57 &&
    u8[9] === 0x41 &&
    u8[10] === 0x56 &&
    u8[11] === 0x45
  ) {
    return true;
  }
  return false;
}

function looksLikeErrorPayload(buf: ArrayBuffer, mime?: string): boolean {
  if (mime && /json|text\/html|javascript|text\/plain|xml/i.test(mime)) return true;
  if (buf.byteLength === 0) return true;
  if (looksLikeAudioBytes(buf)) return false;
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(new Uint8Array(buf).subarray(0, Math.min(buf.byteLength, 512)))
    .trim();
  if (!head) return false;
  if (/^[{\[]/.test(head)) return true;
  if (/^<!DOCTYPE|^<html|^<\?xml/i.test(head)) return true;
  // 代理常见纯文本错误 / 业务失败体
  if (
    /^(error|fail|null|undefined|false|0)\b/i.test(head) ||
    /无法|失败|无效|不存在|拒绝|封禁|试听|vip|付费|版权|empty|not\s*found|forbidden/i.test(head)
  ) {
    return true;
  }
  // 前 64 字节几乎全是可打印字符 → 文本而非音频
  const sample = new Uint8Array(buf).subarray(0, Math.min(buf.byteLength, 64));
  let printable = 0;
  for (const b of sample) {
    if ((b >= 32 && b < 127) || b === 9 || b === 10 || b === 13) printable++;
  }
  return sample.length > 0 && printable / sample.length > 0.9;
}

/**
 * 轻量探测：只拉前几 KB，判断链接是否真是可播音频。
 * 代理链不做整曲物化，但仍必须能拒绝错误体。
 */
async function probePlayableUrl(
  url: string,
  cookies?: string,
): Promise<'ok' | 'bad'> {
  const headers = {
    ...playbackFetchHeaders(url, cookies),
    Range: `bytes=0-${AUDIO_PROBE_BYTES - 1}`,
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const res = await Promise.race([
      request(url, {
        method: 'GET',
        headers,
        timeout: AUDIO_PROBE_TIMEOUT_MS,
        useBackendHttp: isTauri(),
        ignorePageNavigationAbort: true,
        allowNon2xx: true,
      }).finally(() => {
        if (timer) clearTimeout(timer);
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('audio probe timeout')),
          AUDIO_PROBE_TIMEOUT_MS,
        );
      }),
    ]);
    // 206 Partial / 200 OK 均可；其它 4xx/5xx 视为坏链
    if (!(res.ok || res.status === 206)) {
      console.warn('[music] probe HTTP', res.status, url.slice(0, 80));
      return 'bad';
    }
    const buf = await res.arrayBuffer();
    const mime =
      typeof res.headers['content-type'] === 'string'
        ? res.headers['content-type']
        : undefined;
    if (looksLikeErrorPayload(buf, mime)) {
      console.warn(
        '[music] probe rejected non-audio payload',
        { bytes: buf.byteLength, mime: mime?.slice(0, 40), url: url.slice(0, 80) },
      );
      return 'bad';
    }
    if (looksLikeAudioBytes(buf)) return 'ok';
    // 无魔数但非文本：部分 CDN 前置私有头，仍允许直连尝试
    if (buf.byteLength >= 256) {
      console.info('[music] probe ambiguous binary, allow direct', url.slice(0, 80));
      return 'ok';
    }
    console.warn('[music] probe too small / unknown', buf.byteLength, url.slice(0, 80));
    return 'bad';
  } catch (err) {
    console.warn('[music] probe failed', url.slice(0, 80), err);
    return 'bad';
  }
}

async function materializePlayableUrlWithHeaders(
  url: string,
  track: AudioTrack,
  extraHeaders: Record<string, string>,
  cacheTrackId?: string,
  opts?: { allowCache?: boolean },
): Promise<{ url: string; revoke: () => void } | null> {
  try {
    const headers = {
      ...playbackFetchHeaders(url),
      ...extraHeaders,
    };
    const res = await request(url, {
      method: 'GET',
      headers,
      timeout: MATERIALIZE_TIMEOUT_MS,
      useBackendHttp: isTauri(),
      ignorePageNavigationAbort: true,
      allowNon2xx: true,
    });
    if (!res.ok && res.status !== 206) {
      console.warn('[music-mf] header materialize HTTP', res.status, url.slice(0, 80));
      return null;
    }
    const buf = await res.arrayBuffer();
    const mime =
      (typeof res.headers['content-type'] === 'string' && res.headers['content-type']) ||
      'audio/mpeg';
    if (looksLikeErrorPayload(buf, mime)) {
      console.warn('[music-mf] header materialize non-audio', mime.slice(0, 40));
      return null;
    }
    if (buf.byteLength < 8_192 && !looksLikeAudioBytes(buf)) {
      console.warn('[music-mf] header materialize too small', buf.byteLength);
      return null;
    }
    if (opts?.allowCache !== false) {
      void tryCachePlayback(track, url, buf, mime, 'auto', cacheTrackId);
    }
    const blobUrl = createAudioObjectUrl(buf, mime);
    return { url: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) };
  } catch (err) {
    console.warn('[music-mf] header materialize failed', url.slice(0, 80), err);
    return null;
  }
}

/** RequestForwarder 播放时后台拉整曲写入缓存（不阻塞起播） */
const mfBackgroundCacheInflight = new Map<string, Promise<void>>();

async function backgroundCacheMfMediaWithHeaders(
  url: string,
  track: AudioTrack,
  extraHeaders: Record<string, string>,
  cacheTrackId?: string,
): Promise<void> {
  const id = (cacheTrackId?.trim() || track.id).trim();
  const existing = mfBackgroundCacheInflight.get(id);
  if (existing) return existing;

  const task = (async () => {
    try {
      // 已落盘则跳过后台整曲下载（边播边缓存：播放走 proxy，本地已有直接复用）
      try {
        const hit = await getCachedMusicTrackByTrackId(id);
        if (hit && hit.bytes.byteLength >= 8_192) return;
      } catch {
        /* ignore, proceed to fetch */
      }
      // 优先经本机 forwarder 拉流（与播放路径一致，免再拼防盗链头）
      let fetchUrl = url;
      let headers: Record<string, string> = {
        ...playbackFetchHeaders(url),
        ...extraHeaders,
      };
      try {
        const { buildMfProxyPlayUrl } = await import(
          '@/lib/media/audio/online/mf-plugin/request-forwarder'
        );
        const proxyUrl = await buildMfProxyPlayUrl(url, extraHeaders);
        if (proxyUrl) {
          fetchUrl = proxyUrl;
          headers = {};
        }
      } catch {
        /* keep upstream */
      }

      const res = await request(fetchUrl, {
        method: 'GET',
        headers,
        timeout: PROXY_MATERIALIZE_TIMEOUT_MS,
        useBackendHttp: isTauri(),
        ignorePageNavigationAbort: true,
        allowNon2xx: true,
      });
      if (!res.ok && res.status !== 206) {
        console.warn('[music-mf] background cache HTTP', res.status, url.slice(0, 80));
        return;
      }
      const buf = await res.arrayBuffer();
      const mime =
        (typeof res.headers['content-type'] === 'string' && res.headers['content-type']) ||
        'audio/mpeg';
      if (looksLikeErrorPayload(buf, mime)) return;
      if (buf.byteLength < 8_192 && !looksLikeAudioBytes(buf)) return;
      await tryCachePlayback(track, url, buf, mime, 'auto', id);
    } catch (err) {
      console.warn('[music-mf] background cache failed', url.slice(0, 80), err);
    } finally {
      mfBackgroundCacheInflight.delete(id);
    }
  })();

  mfBackgroundCacheInflight.set(id, task);
  return task;
}

async function materializePlayableUrl(
  url: string,
  track: AudioTrack,
  cookies?: string,
  cacheTrackId?: string,
  opts?: { allowCache?: boolean; rejectPreviewBySize?: boolean },
): Promise<{ url: string; revoke: () => void } | null> {
  if (/bitrate\$1(?:&|$)/i.test(url)) {
    console.warn('[music] skip kuwo stub audio', url.slice(0, 80));
    return null;
  }
  const allowCache = opts?.allowCache !== false;
  const rejectPreviewBySize = opts?.rejectPreviewBySize !== false;
  // 代理链：探测通过后必须整曲物化为 blob。
  // 直连跨域无 ACAO 时 MediaElementAudioSource 输出全零（控制台 CORS zeroes），听感静音。
  if (isProxyStylePlayUrl(url)) {
    const probe = await probePlayableUrl(url, cookies);
    if (probe !== 'ok') {
      console.warn('[music] reject bad proxy url', url.slice(0, 80));
      return null;
    }
    console.info('[music] proxy url probed ok, materialize blob', url.slice(0, 80));
    return materializeRemoteAudioToBlob(
      track,
      url,
      cookies,
      PROXY_MATERIALIZE_TIMEOUT_MS,
      cacheTrackId,
      { allowCache, rejectPreviewBySize },
    );
  }
  try {
    const headers = playbackFetchHeaders(url, cookies);

    let materializeTimer: ReturnType<typeof setTimeout> | undefined;
    const res = await Promise.race([
      request(url, {
        method: 'GET',
        headers,
        timeout: MATERIALIZE_TIMEOUT_MS,
        useBackendHttp: isTauri(),
        ignorePageNavigationAbort: true,
        allowNon2xx: true,
      }).finally(() => {
        if (materializeTimer) clearTimeout(materializeTimer);
      }),
      new Promise<never>((_, reject) => {
        materializeTimer = setTimeout(
          () => reject(new Error('materialize timeout')),
          MATERIALIZE_TIMEOUT_MS,
        );
      }),
    ]);
    if (!res.ok) {
      const probe = await probePlayableUrl(url, cookies);
      if (probe === 'ok') {
        console.warn('[music] materialize HTTP', res.status, 'probe ok → blob');
        return materializeRemoteAudioToBlob(
          track,
          url,
          cookies,
          PROXY_MATERIALIZE_TIMEOUT_MS,
          cacheTrackId,
          { allowCache, rejectPreviewBySize },
        );
      }
      console.warn('[music] materialize HTTP', res.status, 'reject');
      return null;
    }
    const buf = await res.arrayBuffer();
    const mime =
      (typeof res.headers['content-type'] === 'string' && res.headers['content-type']) ||
      'audio/mpeg';
    if (looksLikeErrorPayload(buf, mime)) {
      console.warn('[music] materialize got non-audio body, reject', mime.slice(0, 40));
      return null;
    }
    if (buf.byteLength < 8_192) {
      if (buf.byteLength === 0 || !looksLikeAudioBytes(buf)) {
        const probe = await probePlayableUrl(url, cookies);
        if (probe === 'ok') {
          console.warn('[music] small/empty body, probe ok → blob', url.slice(0, 60));
          return materializeRemoteAudioToBlob(
            track,
            url,
            cookies,
            PROXY_MATERIALIZE_TIMEOUT_MS,
            cacheTrackId,
            { allowCache, rejectPreviewBySize },
          );
        }
        console.warn('[music] audio too small, reject', buf.byteLength, url.slice(0, 60));
        return null;
      }
    }
    const dur = parseTrackDurationSec(track.duration);
    if (rejectPreviewBySize && dur >= 60) {
      const minBytes = Math.floor(dur * 8_000);
      if (buf.byteLength < minBytes) {
        console.warn(
          '[music] audio looks like preview fragment',
          { bytes: buf.byteLength, minBytes, dur, url: url.slice(0, 60) },
        );
        return null;
      }
    }
    if (allowCache) {
      void tryCachePlayback(track, url, buf, mime, 'auto', cacheTrackId);
    }
    const blobUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
    return { url: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) };
  } catch (err) {
    console.warn('[music] materialize failed, try probe→blob', url.slice(0, 80), err);
    const probe = await probePlayableUrl(url, cookies);
    if (probe === 'ok') {
      return materializeRemoteAudioToBlob(
        track,
        url,
        cookies,
        PROXY_MATERIALIZE_TIMEOUT_MS,
        cacheTrackId,
        { allowCache, rejectPreviewBySize },
      );
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

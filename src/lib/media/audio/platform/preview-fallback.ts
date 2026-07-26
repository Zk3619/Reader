/**
 * 平台源试听兜底：完整曲不可得时按 UserApi → MF → B站 顺序跨源匹配
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import {
  getOtherSourceTracks,
  isFallbackResolverEnabled,
  notifyToggleTry,
  type ToggleSourceCallbacks,
} from '@/lib/media/audio/platform/fallback-resolver';
import {
  MusicPlaybackStatusText,
} from '@/lib/media/audio/music-playback-status';
import {
  listUserApiScriptIdsForPlayback,
  listUserApiScripts,
} from '@/lib/media/audio/online/user-api-engine';
import { isPlatformSource } from '@/lib/media/audio/platform/platform-sources';

export type PreviewFallbackAccept = (
  url: string,
  track: AudioTrack,
) => Promise<{ url: string; revoke: () => void } | null>;

export type PreviewFallbackHit = {
  playable: { url: string; revoke: () => void };
  track: AudioTrack;
  via: 'userApi' | 'mf' | 'bili';
};

/**
 * 试听/无完整链时跨源匹配顺序（用户定案）：
 * 1. LX UserApi（findMusic 五源候选 × 活跃→其他脚本）
 * 2. MusicFree 插件搜索取流
 * 3. NeriPlayer 平台源 Bilibili
 */
export async function resolvePlatformPreviewFallback(
  track: AudioTrack,
  accept: PreviewFallbackAccept,
  callbacks?: ToggleSourceCallbacks,
  options?: {
    quality?: MusicQuality;
    resolveUserApiUrl: (
      scriptId: string,
      candidate: AudioTrack,
      quality?: MusicQuality,
    ) => Promise<string | null>;
    isUserApiCircuitOpen: (scriptId: string) => boolean;
  },
): Promise<PreviewFallbackHit | null> {
  if (!isFallbackResolverEnabled() || !options) return null;

  callbacks?.onStatus?.(MusicPlaybackStatusText.toggleTry);

  const userApiHit = await tryUserApiFallback(track, accept, callbacks, options);
  if (userApiHit) return userApiHit;

  const mfHit = await tryMfPluginFallback(track, accept, callbacks, options.quality);
  if (mfHit) return mfHit;

  const biliHit = await tryBiliFallback(track, accept, callbacks, options.quality);
  if (biliHit) return biliHit;

  return null;
}

async function tryUserApiFallback(
  track: AudioTrack,
  accept: PreviewFallbackAccept,
  callbacks: ToggleSourceCallbacks | undefined,
  options: {
    quality?: MusicQuality;
    resolveUserApiUrl: (
      scriptId: string,
      candidate: AudioTrack,
      quality?: MusicQuality,
    ) => Promise<string | null>;
    isUserApiCircuitOpen: (scriptId: string) => boolean;
  },
): Promise<PreviewFallbackHit | null> {
  const ids = listUserApiScriptIdsForPlayback(true);
  if (!ids.length) return null;

  const others = await getOtherSourceTracks(track);
  // 平台源本身通常不在 UserApi 矩阵；优先他平台 LX 候选
  const candidates = others.filter((t) => !isPlatformSource(String(t.source)));
  if (!candidates.length) {
    console.info('[music-preview] UserApi: no LX findMusic candidates');
    return null;
  }

  const activeId = ids[0] ?? null;
  if (activeId && !options.isUserApiCircuitOpen(activeId)) {
    const activeName =
      listUserApiScripts().find((x) => x.id === activeId)?.name ?? activeId;
    for (const alt of candidates) {
      notifyToggleTry(alt, callbacks);
      callbacks?.onStatus?.(
        `${MusicPlaybackStatusText.gettingUrl}（${activeName} · ${alt.source}）`,
      );
      const url = await options.resolveUserApiUrl(activeId, alt, options.quality);
      if (!url) continue;
      const playable = await accept(url, alt);
      if (playable) {
        console.info('[music-preview] UserApi hit', activeName, alt.source, alt.name);
        return { playable, track: alt, via: 'userApi' };
      }
      if (options.isUserApiCircuitOpen(activeId)) break;
    }
  }

  // 活跃源失败后再试其他脚本（仍只打 LX 候选）
  for (const scriptId of ids.slice(1)) {
    if (options.isUserApiCircuitOpen(scriptId)) continue;
    const scriptName =
      listUserApiScripts().find((x) => x.id === scriptId)?.name ?? scriptId;
    for (const alt of candidates) {
      notifyToggleTry(alt, callbacks);
      callbacks?.onStatus?.(
        `${MusicPlaybackStatusText.gettingUrl}（${scriptName} · ${alt.source}）`,
      );
      const url = await options.resolveUserApiUrl(scriptId, alt, options.quality);
      if (!url) continue;
      const playable = await accept(url, alt);
      if (playable) {
        console.info('[music-preview] UserApi hit', scriptName, alt.source, alt.name);
        return { playable, track: alt, via: 'userApi' };
      }
    }
  }

  return null;
}

async function tryMfPluginFallback(
  track: AudioTrack,
  accept: PreviewFallbackAccept,
  callbacks: ToggleSourceCallbacks | undefined,
  quality?: MusicQuality,
): Promise<PreviewFallbackHit | null> {
  try {
    const {
      listMfSearchPlugins,
      mfSearch,
      mfGetMediaSource,
      mfPluginDisplayLabel,
    } = await import('@/lib/media/audio/online/mf-plugin');
    const plugins = listMfSearchPlugins();
    if (!plugins.length) return null;

    const keyword = `${track.name} ${track.artist}`.trim();
    if (!keyword) return null;

    for (const plugin of plugins) {
      const label = mfPluginDisplayLabel(plugin.id);
      callbacks?.onStatus?.(`${MusicPlaybackStatusText.gettingUrl}（${label}）`);
      try {
        const { tracks } = await mfSearch(plugin.id, keyword, 1, 'music');
        const alt = pickBestDurationMatch(track, tracks);
        if (!alt) continue;
        notifyToggleTry(alt, callbacks);
        const media = await mfGetMediaSource(plugin.id, alt, quality);
        const url = media?.url?.trim();
        if (!url) continue;

        // 带 headers 的 MF 源：交由上层 accept 物化；此处若有 headers 需先拼代理
        if (media?.headers && Object.keys(media.headers).length > 0) {
          try {
            const { buildMfProxyPlayUrl } = await import(
              '@/lib/media/audio/online/mf-plugin/request-forwarder'
            );
            const headers = {
              ...media.headers,
              ...(media.userAgent ? { 'User-Agent': media.userAgent } : {}),
            };
            const proxyUrl = await buildMfProxyPlayUrl(url, headers);
            if (proxyUrl) {
              const playable = await accept(proxyUrl, alt);
              if (playable) {
                console.info('[music-preview] MF hit', label, alt.name);
                return { playable, track: alt, via: 'mf' };
              }
            }
          } catch {
            /* fall through plain */
          }
        }

        const playable = await accept(url, alt);
        if (playable) {
          console.info('[music-preview] MF hit', label, alt.name);
          return { playable, track: alt, via: 'mf' };
        }
      } catch (err) {
        console.warn('[music-preview] MF plugin failed', plugin.id, err);
      }
    }
  } catch (err) {
    console.warn('[music-preview] MF fallback unavailable', err);
  }
  return null;
}

async function tryBiliFallback(
  track: AudioTrack,
  accept: PreviewFallbackAccept,
  callbacks: ToggleSourceCallbacks | undefined,
  quality?: MusicQuality,
): Promise<PreviewFallbackHit | null> {
  if (track.source === 'bili') return null;
  try {
    const { biliSearch, getBiliSongStream } = await import(
      '@/lib/media/audio/platform/api/bili'
    );
    const keyword = `${track.name} ${track.artist}`.trim();
    if (!keyword) return null;
    callbacks?.onStatus?.(`${MusicPlaybackStatusText.gettingUrl}（哔哩哔哩）`);
    const { tracks } = await biliSearch(keyword, 1, 8);
    const alt = pickBestDurationMatch(track, tracks);
    if (!alt) return null;
    notifyToggleTry(alt, callbacks);
    const stream = await getBiliSongStream(alt, quality);
    const url = stream?.url?.trim();
    if (!url) return null;

    if (stream?.headers && Object.keys(stream.headers).length > 0) {
      try {
        const { buildMfProxyPlayUrl } = await import(
          '@/lib/media/audio/online/mf-plugin/request-forwarder'
        );
        const proxyUrl = await buildMfProxyPlayUrl(url, stream.headers);
        if (proxyUrl) {
          const playable = await accept(proxyUrl, alt);
          if (playable) {
            console.info('[music-preview] Bili hit', alt.name);
            return { playable, track: alt, via: 'bili' };
          }
        }
      } catch {
        /* fall through */
      }
    }

    const playable = await accept(url, alt);
    if (playable) {
      console.info('[music-preview] Bili hit', alt.name);
      return { playable, track: alt, via: 'bili' };
    }
  } catch (err) {
    console.warn('[music-preview] Bili fallback failed', err);
  }
  return null;
}

function parseDurationSec(duration: string | undefined): number {
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

/** 按时长接近度挑候选（试听长度不固定，只作弱启发） */
function pickBestDurationMatch(
  original: AudioTrack,
  candidates: AudioTrack[],
): AudioTrack | null {
  if (!candidates.length) return null;
  const origSec = parseDurationSec(original.duration);
  if (origSec <= 0) return candidates[0] ?? null;
  let best = candidates[0]!;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const sec = parseDurationSec(c.duration);
    const diff = sec > 0 ? Math.abs(sec - origSec) : 9999;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

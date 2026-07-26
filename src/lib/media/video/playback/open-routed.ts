/**
 * 按 PlaybackRouter / 用户强制引擎打开媒体（本地库、番剧、嗅探等共用）
 */

import { getTvPlayPrefs } from '@/lib/media/tv/play/tv-play-prefs';
import { getEffectivePlayPrefsForBangumi } from '@/lib/media/video/bangumi/danmaku-style';
import { openAndroidVideoPlayer } from '@/lib/media/video/playback/android-player';
import { createLibMpvEngine } from '@/lib/media/video/playback/libmpv-engine';
import { resolvePlaybackMediaUrl } from '@/lib/media/video/playback/media-url';
import {
  getVideoPlaybackPrefs,
  shouldDivertHubFromArtplayer,
} from '@/lib/media/video/playback/prefs';
import { resolvePlaybackEngine } from '@/lib/media/video/playback/router';
import type {
  PlaybackEngineId,
  PlaybackRouteInput,
} from '@/lib/media/video/playback/types';
import {
  getPreferredExternalPlayer,
  openInExternalPlayer,
} from '@/lib/media/tv/play/external-player';
import { isAndroid } from '@/lib/platform/detect';
export type OpenRoutedResult = PlaybackEngineId;

export type OpenRoutedOptions = {
  title?: string;
  startSec?: number;
  sourceKind?: PlaybackRouteInput['sourceKind'];
  headers?: Record<string, string>;
};

export { shouldDivertHubFromArtplayer };

async function toArtplayerSrc(mediaUrl: string): Promise<string> {
  const u = mediaUrl.trim();
  if (!u) return u;
  if (/^https?:\/\//i.test(u) || /^blob:/i.test(u) || /^asset:/i.test(u)) {
    // 已是 asset.localhost：仍尝试从 path 解码后放行（热更新后重播）
    if (/^https?:\/\/asset\.localhost\//i.test(u)) {
      try {
        const decoded = decodeURIComponent(
          u.replace(/^https?:\/\/asset\.localhost\//i, ''),
        );
        if (/^[A-Za-z]:[\\/]/.test(decoded) || decoded.startsWith('\\\\')) {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('video_allow_local_media_asset', { path: decoded });
        }
      } catch {
        /* allow 失败仍返回原 URL */
      }
    }
    return u;
  }
  // 本地绝对路径：先放行 asset 作用域，再 convertFileSrc
  try {
    const { convertFileSrc, invoke } = await import('@tauri-apps/api/core');
    await invoke('video_allow_local_media_asset', { path: u });
    return convertFileSrc(u);
  } catch (e) {
    console.warn('[open-routed] local asset allow/convert failed', e);
    try {
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      return convertFileSrc(u);
    } catch {
      return u;
    }
  }
}

/**
 * 尊重设置里的强制引擎；auto 时本地/WebDAV 默认 libmpv，在线默认 artplayer。
 * lite：router 已把 libmpv/Media3 压成 artplayer，仍允许 external。
 */
export async function openRoutedPlayback(
  url: string,
  opts?: OpenRoutedOptions,
): Promise<OpenRoutedResult> {
  const prefs = getVideoPlaybackPrefs();
  const playPrefs =
    opts?.sourceKind === 'bangumi' ? getEffectivePlayPrefsForBangumi() : getTvPlayPrefs();
  const openingSkip = Math.max(0, playPrefs.openingSkipSec || 0);
  const startSec =
    opts?.startSec != null && Number.isFinite(opts.startSec)
      ? Math.max(opts.startSec, openingSkip)
      : openingSkip > 0
        ? openingSkip
        : undefined;
  const mediaUrl = resolvePlaybackMediaUrl(url) || url;
  if (!mediaUrl.trim()) throw new Error('无播放地址');

  const engine = resolvePlaybackEngine({
    url: mediaUrl,
    sourceKind: opts?.sourceKind ?? 'file',
  });

  if (engine === 'artplayer') {
    const { openDirectArtplayerPlay } = await import('@/stores/tv-hub/detail');
    const looksLocal =
      opts?.sourceKind === 'file' ||
      /^[A-Za-z]:[\\/]/.test(mediaUrl) ||
      mediaUrl.startsWith('\\\\') ||
      mediaUrl.startsWith('/');
    const artUrl = await toArtplayerSrc(mediaUrl);
    await openDirectArtplayerPlay({
      url: artUrl,
      title: opts?.title,
      // 片头跳过由 TvPlayPane Artplayer 监听处理；此处不合并 openingSkipSec
      startSec: opts?.startSec,
      localPath: looksLocal ? mediaUrl : undefined,
    });
    return 'artplayer';
  }

  if (engine === 'external') {
    await openInExternalPlayer(mediaUrl, {
      kind: getPreferredExternalPlayer(),
      title: opts?.title,
      startSec,
      headers: opts?.headers,
      anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
      subtitle: prefs.preferredSubtitlePath || undefined,
    });
    return 'external';
  }

  if (engine === 'media3') {
    await openAndroidVideoPlayer('media3', mediaUrl, {
      title: opts?.title,
      startSec,
      headers: opts?.headers,
    });
    return 'media3';
  }

  // libmpv（含桌面 auto 本地默认；Android 走 Activity）
  if (isAndroid()) {
    await openAndroidVideoPlayer('libmpv', mediaUrl, {
      title: opts?.title,
      startSec,
      headers: opts?.headers,
      preferredSubtitlePath: prefs.preferredSubtitlePath || undefined,
    });
    return 'libmpv';
  }

  try {
    const eng = createLibMpvEngine();
    await eng.load({
      url: mediaUrl,
      title: opts?.title,
      startSec,
      headers: opts?.headers,
      subtitle: prefs.preferredSubtitlePath || undefined,
      anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
    });
    return 'libmpv';
  } catch (e) {
    if (prefs.forceEngine === 'libmpv') {
      throw e instanceof Error ? e : new Error(String(e));
    }
    // auto 下增强核失败 → 外置（尊重 externalKind，如 system）
    await openInExternalPlayer(mediaUrl, {
      kind: getPreferredExternalPlayer(),
      title: opts?.title,
      startSec,
      headers: opts?.headers,
      anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
      subtitle: prefs.preferredSubtitlePath || undefined,
    });
    return 'external';
  }
}

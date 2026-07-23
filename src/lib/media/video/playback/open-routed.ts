/**
 * 按 PlaybackRouter / 用户强制引擎打开媒体（本地库、番剧、嗅探等共用）
 */

import { openAndroidVideoPlayer } from '@/lib/media/video/playback/android-player';
import { createLibMpvEngine } from '@/lib/media/video/playback/libmpv-engine';
import { resolvePlaybackMediaUrl } from '@/lib/media/video/playback/media-url';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import { resolvePlaybackEngine } from '@/lib/media/video/playback/router';
import type {
  PlaybackEngineId,
  PlaybackRouteInput,
} from '@/lib/media/video/playback/types';
import {
  getPreferredExternalPlayer,
  openInExternalPlayer,
} from '@/lib/media/tv/play/external-player';

export type OpenRoutedResult = PlaybackEngineId;

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
 */
export async function openRoutedPlayback(
  url: string,
  opts?: {
    title?: string;
    startSec?: number;
    sourceKind?: PlaybackRouteInput['sourceKind'];
  },
): Promise<OpenRoutedResult> {
  const prefs = getVideoPlaybackPrefs();
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
      startSec: opts?.startSec,
      localPath: looksLocal ? mediaUrl : undefined,
    });
    return 'artplayer';
  }

  if (engine === 'external') {
    await openInExternalPlayer(mediaUrl, {
      kind: getPreferredExternalPlayer(),
      title: opts?.title,
      startSec: opts?.startSec,
      anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
      subtitle: prefs.preferredSubtitlePath || undefined,
    });
    return 'external';
  }

  if (engine === 'media3') {
    await openAndroidVideoPlayer('media3', mediaUrl, opts?.title);
    return 'media3';
  }

  // libmpv（含桌面 auto 本地默认）
  try {
    const eng = createLibMpvEngine();
    await eng.load({
      url: mediaUrl,
      title: opts?.title,
      startSec: opts?.startSec,
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
      startSec: opts?.startSec,
      anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
      subtitle: prefs.preferredSubtitlePath || undefined,
    });
    return 'external';
  }
}

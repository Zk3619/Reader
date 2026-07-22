/**
 * 播放核偏好：引擎路由、Anime4K、外置深度交接
 */

import type {
  Anime4KMode,
  Anime4KQuality,
  PlaybackEngineId,
} from '@/lib/media/video/playback/types';

export type ExternalPlayerKindPref = 'mpv' | 'vlc' | 'system';

const STORAGE_KEY = 'reader.video.playbackPrefs.v1';

export type VideoPlaybackPrefs = {
  /** 强制引擎；auto 按路由规则 */
  forceEngine: PlaybackEngineId | 'auto';
  /** Android：Artplayer 失败后尝试 Media3 */
  androidFallbackMedia3: boolean;
  anime4kMode: Anime4KMode;
  anime4kQuality: Anime4KQuality;
  /** 外置 mpv：启用 IPC 进度尽力回读 */
  externalIpcEnabled: boolean;
  /** 外置/内嵌共用：副字幕路径（可选） */
  preferredSubtitlePath: string;
  /** Anime4K GLSL 根目录（空=应用资源默认） */
  anime4kShadersDir: string;
  /** 外置播放器种类（与旧 key 同步） */
  externalKind: ExternalPlayerKindPref;
};

const DEFAULTS: VideoPlaybackPrefs = {
  forceEngine: 'auto',
  androidFallbackMedia3: true,
  anime4kMode: 'off',
  anime4kQuality: 'balanced',
  externalIpcEnabled: true,
  preferredSubtitlePath: '',
  anime4kShadersDir: '',
  externalKind: 'system',
};

export function getVideoPlaybackPrefs(): VideoPlaybackPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<VideoPlaybackPrefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setVideoPlaybackPrefs(
  patch: Partial<VideoPlaybackPrefs>,
): VideoPlaybackPrefs {
  const next = { ...getVideoPlaybackPrefs(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

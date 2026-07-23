/**
 * 播放核偏好：引擎路由、Anime4K、外置深度交接
 */

import type {
  Anime4KMode,
  Anime4KQuality,
  PlaybackEngineId,
} from '@/lib/media/video/playback/types';

export type ExternalPlayerKindPref = 'mpv' | 'vlc' | 'system';

/** 本地 / WebDAV 文件在强制引擎为 auto 时的默认播放方式 */
export type LocalPlaybackEnginePref = PlaybackEngineId;

const STORAGE_KEY = 'reader.video.playbackPrefs.v1';

export type VideoPlaybackPrefs = {
  /** 强制引擎；auto 按路由规则 */
  forceEngine: PlaybackEngineId | 'auto';
  /**
   * 本地库 / WebDAV / file:// 的播放方式（仅 forceEngine=auto 时生效）。
   * 全局强制引擎会覆盖此项。
   */
  localEngine: LocalPlaybackEnginePref;
  /** Android：Artplayer 失败后尝试 Media3 */
  androidFallbackMedia3: boolean;
  anime4kMode: Anime4KMode;
  anime4kQuality: Anime4KQuality;
  /** 链尾追加 Anime4K_Deblur_DoG */
  anime4kDeblur: boolean;
  /** 外置 mpv：启用 IPC 进度尽力回读 */
  externalIpcEnabled: boolean;
  /** 外置/内嵌共用：副字幕路径（可选） */
  preferredSubtitlePath: string;
  /** Anime4K GLSL 根目录（空=应用 resources/shaders） */
  anime4kShadersDir: string;
  /** 外置播放器种类（与旧 key 同步） */
  externalKind: ExternalPlayerKindPref;
  /**
   * libmpv：使用 vo=gpu-next（与 Anime4K 互斥；开启时忽略 shaders）
   */
  libmpvGpuNext: boolean;
  /** libmpv hwdec：auto | no | d3d11va | vulkan 等 */
  libmpvHwdec: string;
};

const DEFAULTS: VideoPlaybackPrefs = {
  forceEngine: 'auto',
  localEngine: 'libmpv',
  androidFallbackMedia3: true,
  anime4kMode: 'off',
  anime4kQuality: 'balanced',
  anime4kDeblur: false,
  externalIpcEnabled: true,
  preferredSubtitlePath: '',
  anime4kShadersDir: '',
  externalKind: 'system',
  libmpvGpuNext: false,
  libmpvHwdec: 'auto',
};

function coerceLocalEngine(
  v: unknown,
): LocalPlaybackEnginePref {
  if (v === 'artplayer' || v === 'libmpv' || v === 'media3' || v === 'external') {
    return v;
  }
  return DEFAULTS.localEngine;
}

export function getVideoPlaybackPrefs(): VideoPlaybackPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<VideoPlaybackPrefs>;
    return {
      ...DEFAULTS,
      ...parsed,
      localEngine: coerceLocalEngine(parsed.localEngine),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setVideoPlaybackPrefs(
  patch: Partial<VideoPlaybackPrefs>,
): VideoPlaybackPrefs {
  const merged = { ...getVideoPlaybackPrefs(), ...patch };
  const next: VideoPlaybackPrefs = {
    ...merged,
    localEngine: coerceLocalEngine(merged.localEngine),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

/**
 * 播放核偏好：引擎路由、Anime4K、外置深度交接
 */

import type {
  Anime4KMode,
  Anime4KQuality,
  PlaybackEngineId,
} from '@/lib/media/video/playback/types';
import {
  coerceAudioEqPreset,
  type AudioEqPreset,
} from '@/lib/media/video/playback/audio-eq';
import {
  coerceFrameInterpBackend,
  coerceFrameInterpFactor,
  type FrameInterpBackend,
  type FrameInterpFactor,
} from '@/lib/media/video/playback/frame-interp';

export type { AudioEqPreset } from '@/lib/media/video/playback/audio-eq';

/** 内置外置播放器 */
export type ExternalPlayerBuiltin = 'mpv' | 'vlc' | 'system';

/** 选择值：内置，或 `custom:${presetId}` */
export type ExternalPlayerKindPref = ExternalPlayerBuiltin | `custom:${string}`;

/** 用户添加的播放器可执行文件预设（PotPlayer 等） */
export type ExternalPlayerPreset = {
  id: string;
  name: string;
  exePath: string;
  /** 媒体路径前的附加参数 */
  extraArgs: string[];
};

/** 本地 / WebDAV 文件在强制引擎为 auto 时的默认播放方式 */
export type LocalPlaybackEnginePref = PlaybackEngineId;

/** 视频输出后端（显式设置，避免静默落到 GPU-Next） */
export type LibmpvVideoOutput = 'gpu' | 'gpu-next';

/** 常用硬解预设（UI）；仍允许自定义字符串写入 libmpvHwdec */
export type LibmpvHwdecPreset =
  | 'auto'
  | 'auto-copy'
  | 'd3d11va'
  | 'd3d11va-copy'
  | 'dxva2'
  | 'dxva2-copy'
  | 'vulkan'
  | 'vulkan-copy'
  | 'no';

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
  /** 自定义外置播放器预设 */
  externalPresets: ExternalPlayerPreset[];
  /**
   * 视频输出 VO：GPU（经典，兼容 Anime4K）或 GPU-Next。
   * 取代旧布尔 libmpvGpuNext。
   */
  libmpvVideoOutput: LibmpvVideoOutput;
  /**
   * @deprecated 读取时迁移到 libmpvVideoOutput；写入时同步
   */
  libmpvGpuNext?: boolean;
  /** libmpv / 外置 mpv hwdec 字符串 */
  libmpvHwdec: string;
  /**
   * 开 Anime4K 时强制 VO=GPU（即使偏好为 GPU-Next）。
   * 关闭且 VO=GPU-Next 时，超分控件不可用。
   */
  anime4kForceGpuVo: boolean;
  /**
   * 开 Anime4K 时自动把 Auto / D3D11VA 等改为 *-Copy，便于 Shader。
   */
  anime4kHwdecAdapt: boolean;
  /** 字幕字体名（空=mpv 默认） */
  subFont: string;
  /** 字幕字号（mpv sub-font-size；0=不覆盖） */
  subFontSize: number;
  /** 字幕缩放（mpv sub-scale；1=默认） */
  subScale: number;
  /**
   * HDR 色调映射：auto | no | bt.2390 | mobius | reinhard |hable | gamma | linear
   */
  hdrToneMapping: string;
  /**
   * HDR 提示：空 | yes（target-colorspace-hint）
   */
  hdrTargetColorspaceHint: boolean;
  /** softvol 0–100 */
  volume: number;
  muted: boolean;
  /** 听视频：video=no */
  listenOnly: boolean;
  /** 简易均衡器预置（libmpv / 外置 mpv） */
  audioEqPreset: AudioEqPreset;
  /** 实时 AI 补帧（RIFE）；默认关 */
  frameInterpEnabled: boolean;
  /** 预留引擎 id */
  frameInterpEngine: 'rife';
  /** auto=TRT → DirectML → ncnn */
  frameInterpBackend: FrameInterpBackend;
  frameInterpFactor: FrameInterpFactor;
  frameInterpModel: string;
  /** 源 fps 高于此则直通不插 */
  frameInterpMaxInputFps: number;
  frameInterpSceneDetect: boolean;
  /** AI 不可用时用 mpv 非 AI interpolation */
  frameInterpLightweightFallback: boolean;
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
  externalPresets: [],
  libmpvVideoOutput: 'gpu',
  libmpvHwdec: 'auto',
  anime4kForceGpuVo: true,
  anime4kHwdecAdapt: true,
  subFont: '',
  subFontSize: 0,
  subScale: 1,
  hdrToneMapping: 'auto',
  hdrTargetColorspaceHint: true,
  volume: 100,
  muted: false,
  listenOnly: false,
  audioEqPreset: 'off',
  frameInterpEnabled: false,
  frameInterpEngine: 'rife',
  frameInterpBackend: 'auto',
  frameInterpFactor: 2,
  frameInterpModel: '4.15_lite',
  frameInterpMaxInputFps: 30,
  frameInterpSceneDetect: true,
  frameInterpLightweightFallback: false,
};

function coerceLocalEngine(
  v: unknown,
): LocalPlaybackEnginePref {
  if (v === 'artplayer' || v === 'libmpv' || v === 'media3' || v === 'external') {
    return v;
  }
  return DEFAULTS.localEngine;
}

function coerceVideoOutput(
  raw: Partial<VideoPlaybackPrefs> & { libmpvGpuNext?: boolean },
): LibmpvVideoOutput {
  if (raw.libmpvVideoOutput === 'gpu' || raw.libmpvVideoOutput === 'gpu-next') {
    return raw.libmpvVideoOutput;
  }
  // 旧字段迁移
  if (raw.libmpvGpuNext === true) return 'gpu-next';
  return DEFAULTS.libmpvVideoOutput;
}

function coercePreset(raw: unknown): ExternalPlayerPreset | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  const exePath = typeof o.exePath === 'string' ? o.exePath.trim() : '';
  if (!id || !name || !exePath) return null;
  const extraArgs = Array.isArray(o.extraArgs)
    ? o.extraArgs.filter((a): a is string => typeof a === 'string' && a.length > 0)
    : [];
  return { id, name, exePath, extraArgs };
}

export function coerceExternalPresets(v: unknown): ExternalPlayerPreset[] {
  if (!Array.isArray(v)) return [];
  const out: ExternalPlayerPreset[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    const p = coercePreset(item);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export function coerceExternalKind(
  v: unknown,
  presets: ExternalPlayerPreset[],
): ExternalPlayerKindPref {
  if (v === 'mpv' || v === 'vlc' || v === 'system') return v;
  if (typeof v === 'string' && v.startsWith('custom:')) {
    const id = v.slice('custom:'.length);
    if (presets.some((p) => p.id === id)) return `custom:${id}`;
  }
  return DEFAULTS.externalKind;
}

export function isExternalPlayerBuiltin(
  kind: string,
): kind is ExternalPlayerBuiltin {
  return kind === 'mpv' || kind === 'vlc' || kind === 'system';
}

export function externalCustomKind(presetId: string): ExternalPlayerKindPref {
  return `custom:${presetId}`;
}

export function parseExternalCustomId(kind: string): string | null {
  if (!kind.startsWith('custom:')) return null;
  const id = kind.slice('custom:'.length).trim();
  return id || null;
}

function normalizePrefs(
  parsed: Partial<VideoPlaybackPrefs> & { libmpvGpuNext?: boolean },
): VideoPlaybackPrefs {
  const externalPresets = coerceExternalPresets(parsed.externalPresets);
  const libmpvVideoOutput = coerceVideoOutput(parsed);
  return {
    ...DEFAULTS,
    ...parsed,
    localEngine: coerceLocalEngine(parsed.localEngine),
    externalPresets,
    externalKind: coerceExternalKind(parsed.externalKind, externalPresets),
    libmpvVideoOutput,
    // 与旧布尔保持镜像，避免旧代码读到 undefined
    libmpvGpuNext: libmpvVideoOutput === 'gpu-next',
    anime4kForceGpuVo:
      typeof parsed.anime4kForceGpuVo === 'boolean'
        ? parsed.anime4kForceGpuVo
        : DEFAULTS.anime4kForceGpuVo,
    anime4kHwdecAdapt:
      typeof parsed.anime4kHwdecAdapt === 'boolean'
        ? parsed.anime4kHwdecAdapt
        : DEFAULTS.anime4kHwdecAdapt,
    libmpvHwdec:
      typeof parsed.libmpvHwdec === 'string' && parsed.libmpvHwdec.trim()
        ? parsed.libmpvHwdec.trim()
        : DEFAULTS.libmpvHwdec,
    subFont: typeof parsed.subFont === 'string' ? parsed.subFont : DEFAULTS.subFont,
    subFontSize:
      typeof parsed.subFontSize === 'number' && Number.isFinite(parsed.subFontSize)
        ? parsed.subFontSize
        : DEFAULTS.subFontSize,
    subScale:
      typeof parsed.subScale === 'number' && Number.isFinite(parsed.subScale) && parsed.subScale > 0
        ? parsed.subScale
        : DEFAULTS.subScale,
    hdrToneMapping:
      typeof parsed.hdrToneMapping === 'string' && parsed.hdrToneMapping.trim()
        ? parsed.hdrToneMapping.trim()
        : DEFAULTS.hdrToneMapping,
    hdrTargetColorspaceHint:
      typeof parsed.hdrTargetColorspaceHint === 'boolean'
        ? parsed.hdrTargetColorspaceHint
        : DEFAULTS.hdrTargetColorspaceHint,
    volume:
      typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? Math.max(0, Math.min(300, parsed.volume))
        : DEFAULTS.volume,
    muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULTS.muted,
    listenOnly:
      typeof parsed.listenOnly === 'boolean' ? parsed.listenOnly : DEFAULTS.listenOnly,
    audioEqPreset: coerceAudioEqPreset(parsed.audioEqPreset),
    frameInterpEnabled:
      typeof parsed.frameInterpEnabled === 'boolean'
        ? parsed.frameInterpEnabled
        : DEFAULTS.frameInterpEnabled,
    frameInterpEngine: 'rife',
    frameInterpBackend: coerceFrameInterpBackend(parsed.frameInterpBackend),
    frameInterpFactor: coerceFrameInterpFactor(parsed.frameInterpFactor),
    frameInterpModel:
      typeof parsed.frameInterpModel === 'string' && parsed.frameInterpModel.trim()
        ? parsed.frameInterpModel.trim()
        : DEFAULTS.frameInterpModel,
    frameInterpMaxInputFps:
      typeof parsed.frameInterpMaxInputFps === 'number' &&
      Number.isFinite(parsed.frameInterpMaxInputFps)
        ? Math.max(1, Math.min(120, parsed.frameInterpMaxInputFps))
        : DEFAULTS.frameInterpMaxInputFps,
    frameInterpSceneDetect:
      typeof parsed.frameInterpSceneDetect === 'boolean'
        ? parsed.frameInterpSceneDetect
        : DEFAULTS.frameInterpSceneDetect,
    frameInterpLightweightFallback:
      typeof parsed.frameInterpLightweightFallback === 'boolean'
        ? parsed.frameInterpLightweightFallback
        : DEFAULTS.frameInterpLightweightFallback,
  };
}

export function getVideoPlaybackPrefs(): VideoPlaybackPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, externalPresets: [] };
    const parsed = JSON.parse(raw) as Partial<VideoPlaybackPrefs> & {
      libmpvGpuNext?: boolean;
    };
    return normalizePrefs(parsed);
  } catch {
    return { ...DEFAULTS, externalPresets: [] };
  }
}

/**
 * Hub 搜索/点播/直播默认 Artplayer；仅强制引擎为 libmpv/external/media3 时分流。
 * 放在 prefs（无循环依赖），供 detail/live 动态 import。
 */
export function shouldDivertHubFromArtplayer(): boolean {
  const fe = getVideoPlaybackPrefs().forceEngine;
  return fe !== 'auto' && fe !== 'artplayer';
}

export function setVideoPlaybackPrefs(
  patch: Partial<VideoPlaybackPrefs> & { libmpvGpuNext?: boolean },
): VideoPlaybackPrefs {
  const prev = getVideoPlaybackPrefs();
  // 兼容仍写 libmpvGpuNext 的调用方
  const bridged: Partial<VideoPlaybackPrefs> & { libmpvGpuNext?: boolean } = {
    ...patch,
  };
  if (patch.libmpvVideoOutput == null && typeof patch.libmpvGpuNext === 'boolean') {
    bridged.libmpvVideoOutput = patch.libmpvGpuNext ? 'gpu-next' : 'gpu';
  }
  if (patch.libmpvVideoOutput != null) {
    bridged.libmpvGpuNext = patch.libmpvVideoOutput === 'gpu-next';
  }

  let next = normalizePrefs({ ...prev, ...bridged });

  // GPU-Next 且不允许强制 GPU → 禁止保持超分开启
  if (
    next.libmpvVideoOutput === 'gpu-next' &&
    !next.anime4kForceGpuVo &&
    next.anime4kMode !== 'off'
  ) {
    next = { ...next, anime4kMode: 'off', anime4kDeblur: false };
  }

  // 强制 Artplayer / Media3 / 非 MPV 外置 → Anime4K 无效，自动关闭
  if (
    next.anime4kMode !== 'off' &&
    (next.forceEngine === 'artplayer' ||
      next.forceEngine === 'media3' ||
      (next.forceEngine === 'external' && next.externalKind !== 'mpv'))
  ) {
    next = { ...next, anime4kMode: 'off', anime4kDeblur: false };
  }

  // RIFE 与 Anime4K 互斥：开补帧则关超分；开超分则关补帧（后写 patch 优先）
  if (next.frameInterpEnabled && next.anime4kMode !== 'off') {
    if (patch.frameInterpEnabled === true || patch.anime4kMode == null) {
      next = { ...next, anime4kMode: 'off', anime4kDeblur: false };
    } else {
      next = { ...next, frameInterpEnabled: false };
    }
  }

  // 开补帧强制 VO=GPU
  if (next.frameInterpEnabled) {
    next = { ...next, libmpvVideoOutput: 'gpu', libmpvGpuNext: false };
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

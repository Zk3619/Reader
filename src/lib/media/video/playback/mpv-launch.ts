/**
 * libmpv / 外置 mpv 启动参数解析 + UI 标签（Title Case）
 */

import {
  getVideoPlaybackPrefs,
  type LibmpvHwdecPreset,
  type LibmpvVideoOutput,
  type VideoPlaybackPrefs,
} from '@/lib/media/video/playback/prefs';
import type { Anime4KMode, Anime4KQuality } from '@/lib/media/video/playback/types';

export type ResolvedMpvLaunchOpts = {
  /** 是否应用 Anime4K shader 链 */
  anime4kOn: boolean;
  /** 最终 vo：gpu | gpu-next */
  videoOutput: LibmpvVideoOutput;
  /** 传给 mpv 的 hwdec；null 表示不设 */
  hwdec: string | null;
  /** 对应 Rust gpuNext / CLI --vo */
  useGpuNext: boolean;
};

export const FORCE_ENGINE_OPTIONS = [
  'auto',
  'artplayer',
  'libmpv',
  'media3',
  'external',
] as const;

export const FORCE_ENGINE_LABELS: Record<(typeof FORCE_ENGINE_OPTIONS)[number], string> = {
  auto: 'Auto',
  artplayer: 'Artplayer',
  libmpv: 'Libmpv',
  media3: 'Media3',
  external: 'External',
};

export const EXTERNAL_KIND_BUILTIN_LABELS: Record<'mpv' | 'vlc' | 'system', string> = {
  system: 'System',
  mpv: 'MPV',
  vlc: 'VLC',
};

/** 引擎 id → Title Case 展示名 */
export function formatEngineLabel(engine: string): string {
  const key = engine.trim().toLowerCase();
  if (key in FORCE_ENGINE_LABELS) {
    return FORCE_ENGINE_LABELS[key as keyof typeof FORCE_ENGINE_LABELS];
  }
  if (!key) return 'Unknown';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** 当前外置播放器种类的可读名称（含自定义预设名） */
export function formatExternalPlayerLabel(
  prefs: VideoPlaybackPrefs = getVideoPlaybackPrefs(),
): string {
  const kind = prefs.externalKind;
  if (kind === 'mpv' || kind === 'vlc' || kind === 'system') {
    return EXTERNAL_KIND_BUILTIN_LABELS[kind];
  }
  if (kind.startsWith('custom:')) {
    const id = kind.slice('custom:'.length);
    const preset = prefs.externalPresets.find((p) => p.id === id);
    if (preset?.name.trim()) return preset.name.trim();
    return 'Custom';
  }
  return 'External';
}

/**
 * 播放结果通知描述：引擎用 Title Case；External 时附带具体播放器名。
 * 例：`External · MPV · CCTV1` / `Libmpv · 影片名`
 */
export function formatPlaybackToastDescription(
  engine: string,
  detail?: string,
  prefs: VideoPlaybackPrefs = getVideoPlaybackPrefs(),
): string {
  const eng = formatEngineLabel(engine);
  const parts: string[] = [];
  if (eng.toLowerCase() === 'external') {
    parts.push('External');
    parts.push(formatExternalPlayerLabel(prefs));
  } else {
    parts.push(eng);
  }
  const d = (detail || '').trim();
  if (d) parts.push(d);
  return parts.join(' · ');
}

export const ANIME4K_MODE_OPTIONS: Anime4KMode[] = [
  'off',
  'A',
  'B',
  'C',
  'AA',
  'BB',
  'CA',
];

export const ANIME4K_MODE_LABELS: Record<Anime4KMode, string> = {
  off: 'Off',
  A: 'Mode A',
  B: 'Mode B',
  C: 'Mode C',
  AA: 'Mode A+A',
  BB: 'Mode B+B',
  CA: 'Mode C+A',
};

export const ANIME4K_QUALITY_OPTIONS: Anime4KQuality[] = [
  'fast',
  'balanced',
  'high',
];

export const ANIME4K_QUALITY_LABELS: Record<Anime4KQuality, string> = {
  fast: 'Fast',
  balanced: 'Balanced',
  high: 'High',
};

export const VIDEO_OUTPUT_OPTIONS: LibmpvVideoOutput[] = ['gpu', 'gpu-next'];

export const VIDEO_OUTPUT_LABELS: Record<LibmpvVideoOutput, string> = {
  gpu: 'GPU',
  'gpu-next': 'GPU-Next',
};

export const HWDEC_PRESET_OPTIONS: LibmpvHwdecPreset[] = [
  'auto',
  'auto-copy',
  'd3d11va',
  'd3d11va-copy',
  'dxva2',
  'dxva2-copy',
  'vulkan',
  'vulkan-copy',
  'no',
];

export const HWDEC_PRESET_LABELS: Record<LibmpvHwdecPreset, string> = {
  auto: 'Auto',
  'auto-copy': 'Auto-Copy',
  d3d11va: 'D3D11VA',
  'd3d11va-copy': 'D3D11VA-Copy',
  dxva2: 'DXVA2',
  'dxva2-copy': 'DXVA2-Copy',
  vulkan: 'Vulkan',
  'vulkan-copy': 'Vulkan-Copy',
  no: 'No (Software)',
};

/** 术语说明（设置页） */
export const PLAYBACK_TERM_NOTES = {
  anime4k:
    'Anime4K：面向动漫的实时 GLSL 超分/修复链，仅在 Libmpv 或外置 MPV 上生效；Artplayer 主路不支持。',
  deblur:
    'Anime4K Deblur（DoG）：在超分链尾追加反模糊着色器，可略增锐度，也可能带来噪点；默认关闭。',
  gpu: 'GPU：经典 mpv 视频输出（vo=gpu）。支持传统 glsl-shaders，Anime4K 依赖此路径。',
  gpuNext:
    'GPU-Next：新一代输出（vo=gpu-next），HDR/部分画质更好，但与 Anime4K 的 glsl-shaders 不兼容。',
  forceGpuVo:
    '开超分时强制 GPU：启用 Anime4K 时自动改用 VO=GPU，避免新版 Libmpv 默认落到 GPU-Next 导致超分无感。',
  hwdecAdapt:
    '开超分时自动 Copy 硬解：将 Auto / D3D11VA 等改为 Auto-Copy / D3D11VA-Copy，使帧可进入 Shader 管线。',
  autoCopy:
    'Auto-Copy：硬解后把帧拷回可过滤的内存路径，便于 Shader；比纯硬解稍耗性能。',
  d3d11va:
    'D3D11VA：Windows Direct3D 11 硬解。纯 D3D11VA 时常跳过 Anime4K；配合超分请用 D3D11VA-Copy 或开启自动 Copy。',
  d3d11vaCopy:
    'D3D11VA-Copy：D3D11VA 硬解 + 拷贝回可过滤表面，Anime4K 可生效。',
} as const;

function toCopyHwdec(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (!lower || lower === 'auto') return 'auto-copy';
  if (lower === 'no' || lower === 'none' || lower.endsWith('-copy')) return raw.trim();
  if (lower === 'd3d11va') return 'd3d11va-copy';
  if (lower === 'dxva2') return 'dxva2-copy';
  if (lower === 'vulkan') return 'vulkan-copy';
  if (lower === 'cuda') return 'cuda-copy';
  return 'auto-copy';
}

/**
 * 根据偏好解析最终 VO / hwdec / 是否开超分（不含 shader 路径探测）。
 */
export function resolveMpvLaunchOpts(
  prefs: VideoPlaybackPrefs = getVideoPlaybackPrefs(),
  opts?: { anime4kMode?: Anime4KMode },
): ResolvedMpvLaunchOpts {
  const mode = opts?.anime4kMode ?? prefs.anime4kMode;
  const wantAnime4k = mode !== 'off';

  // GPU-Next 且不允许强制 GPU → 超分关闭
  const blockedByVo =
    wantAnime4k &&
    prefs.libmpvVideoOutput === 'gpu-next' &&
    !prefs.anime4kForceGpuVo;

  const anime4kOn = wantAnime4k && !blockedByVo;

  let videoOutput: LibmpvVideoOutput = prefs.libmpvVideoOutput;
  if (anime4kOn && prefs.anime4kForceGpuVo) {
    videoOutput = 'gpu';
  }

  const hwRaw = prefs.libmpvHwdec.trim();
  let hwdec: string | null = hwRaw || null;
  if (anime4kOn && prefs.anime4kHwdecAdapt) {
    hwdec = toCopyHwdec(hwRaw || 'auto');
  }

  return {
    anime4kOn,
    videoOutput,
    hwdec,
    useGpuNext: videoOutput === 'gpu-next',
  };
}

export type Anime4KAvailability = {
  usable: boolean;
  reasons: string[];
};

/**
 * 设置页：判断 Anime4K 控件是否可启用。
 * Web/Rust 后端：走 canvas/WebGPU，不依赖 mpv shaders / Force Engine。
 * 强制 Artplayer / Media3 / 非 MPV 外置时，mpv 路不可用。
 */
export function evaluateAnime4KAvailability(input: {
  prefs: VideoPlaybackPrefs;
  shadersReady: boolean;
  libmpvAvailable: boolean;
}): Anime4KAvailability {
  const { prefs, shadersReady, libmpvAvailable } = input;

  if (
    prefs.enhanceBackend === 'web' ||
    prefs.enhanceBackend === 'rust-demux' ||
    prefs.enhanceBackend === 'rust-native'
  ) {
    return {
      usable: true,
      reasons: [],
    };
  }

  const reasons: string[] = [];

  const fe = prefs.forceEngine;
  if (fe === 'artplayer') {
    reasons.push(
      'Force Engine 为 Artplayer：WebView 主路不支持 mpv Anime4K；请将「画质增强后端」设为 Web 以使用 canvas 超分',
    );
  } else if (fe === 'media3') {
    reasons.push('Force Engine 为 Media3：不支持 Anime4K GLSL');
  } else if (fe === 'external' && prefs.externalKind !== 'mpv') {
    reasons.push(
      'Force Engine 为 External，但外置不是 MPV（System / VLC / 自定义不会注入 Anime4K）',
    );
  } else if (fe === 'libmpv' && !libmpvAvailable) {
    reasons.push(
      'Force Engine 为 Libmpv，但当前不可用（需 pnpm tauri:dev:libmpv + DLL）',
    );
  } else if (fe === 'auto' && !libmpvAvailable && prefs.externalKind !== 'mpv') {
    reasons.push(
      '当前无法跑 mpv 超分：Libmpv 不可用，且外置不是 MPV；或将增强后端设为 Web',
    );
  }

  if (!shadersReady) {
    reasons.push('未找到 Anime4K Shader 资源（请确认捆绑 resources/shaders）');
  }

  if (prefs.libmpvVideoOutput === 'gpu-next' && !prefs.anime4kForceGpuVo) {
    reasons.push(
      'Video Output 为 GPU-Next，且未开启「开超分时强制 GPU」——Anime4K 无法生效',
    );
  }

  return { usable: reasons.length === 0, reasons };
}

/** 当前路由强制引擎是否会使 Anime4K 完全无效（用于写偏好时自动 Mode=Off） */
export function isAnime4KBlockedByForceEngine(
  prefs: Pick<VideoPlaybackPrefs, 'forceEngine' | 'externalKind'>,
): boolean {
  if (prefs.forceEngine === 'artplayer' || prefs.forceEngine === 'media3') {
    return true;
  }
  if (prefs.forceEngine === 'external' && prefs.externalKind !== 'mpv') {
    return true;
  }
  return false;
}

/**
 * 实时补帧（RIFE）：prefs 解析、vf 拼装、与 Anime4K 互斥
 * @see docs/VIDEO_RIFE.md
 */

import type { VideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';

/** auto：TRT → DirectML → ncnn */
export type FrameInterpBackend = 'auto' | 'trt' | 'dml' | 'ncnn';
export type FrameInterpFactor = 2 | 3 | 4;
export type FrameInterpResolvedBackend = 'trt' | 'dml' | 'ncnn';

export type RifeProbeStatus = {
  available: boolean;
  /** 实际将用的后端；unavailable 时为 null */
  backend: FrameInterpResolvedBackend | null;
  detail: string;
  scriptPath: string;
  models: string[];
  hasTrt: boolean;
  hasDml: boolean;
  hasNcnn: boolean;
};

export const FRAME_INTERP_BACKEND_OPTIONS: FrameInterpBackend[] = [
  'auto',
  'trt',
  'dml',
  'ncnn',
];

export const FRAME_INTERP_FACTOR_OPTIONS: FrameInterpFactor[] = [2, 3, 4];

export const FRAME_INTERP_MODEL_OPTIONS = [
  '4.15_lite',
  '4.6',
  '4.25',
  '4.26',
] as const;

export function coerceFrameInterpBackend(v: unknown): FrameInterpBackend {
  if (v === 'auto' || v === 'trt' || v === 'dml' || v === 'ncnn') return v;
  return 'auto';
}

export function coerceFrameInterpFactor(v: unknown): FrameInterpFactor {
  const n = Number(v);
  if (n === 3 || n === 4) return n;
  return 2;
}

/** 探测结果 + prefs → 实际后端（auto：trt → dml → ncnn） */
export function resolveFrameInterpBackend(
  pref: FrameInterpBackend,
  probe: Pick<RifeProbeStatus, 'hasTrt' | 'hasDml' | 'hasNcnn'>,
): FrameInterpResolvedBackend | null {
  if (pref === 'trt') return probe.hasTrt ? 'trt' : null;
  if (pref === 'dml') return probe.hasDml ? 'dml' : null;
  if (pref === 'ncnn') return probe.hasNcnn ? 'ncnn' : null;
  if (probe.hasTrt) return 'trt';
  if (probe.hasDml) return 'dml';
  if (probe.hasNcnn) return 'ncnn';
  return null;
}

/**
 * 拼 mpv vf：vapoursynth=file=...:user-data=...
 * scriptPath 须为绝对路径。
 */
export function buildRifeVapoursynthVf(opts: {
  scriptPath: string;
  backend: FrameInterpResolvedBackend;
  factor: number;
  model: string;
  sceneDetect: boolean;
  maxInputFps: number;
}): string {
  const script = opts.scriptPath.replace(/\\/g, '/');
  const ud = [
    `backend=${opts.backend}`,
    `factor=${opts.factor}`,
    `model=${encodeURIComponent(opts.model || '4.15_lite')}`,
    `sc=${opts.sceneDetect ? 1 : 0}`,
    `max_fps=${Math.max(1, Math.round(opts.maxInputFps))}`,
  ].join(',');
  return `vapoursynth=file=${script}:buffered-frames=2:user-data=${ud}`;
}

/** 开补帧时启动参数侧效应（VO / hwdec）；Anime4K 应已由 prefs 互斥关掉 */
export function applyFrameInterpLaunchOverrides(
  prefs: VideoPlaybackPrefs,
): Pick<VideoPlaybackPrefs, 'libmpvVideoOutput' | 'libmpvHwdec'> | null {
  if (!prefs.frameInterpEnabled) return null;
  let hw = prefs.libmpvHwdec || 'auto';
  if (!hw.includes('copy') && hw !== 'no') {
    if (hw === 'auto' || hw === 'd3d11va' || hw === 'dxva2' || hw === 'vulkan') {
      hw = hw === 'auto' ? 'auto-copy' : `${hw}-copy`;
    } else if (!hw.endsWith('-copy')) {
      hw = 'auto-copy';
    }
  }
  return {
    libmpvVideoOutput: 'gpu',
    libmpvHwdec: hw,
  };
}

/**
 * 画质增强管线协议（与 PlaybackEngineId 解耦）
 * @see docs/VIDEO_WEB_ENHANCE.md
 */

export type EnhancePipelineId =
  | 'web-full'
  | 'web-sr'
  | 'video-overlay'
  | 'rust-demux'
  | 'rust-native'
  | 'mpv'
  | 'none';

/** 用户可选的增强后端（持久化） */
export type EnhanceBackendPref =
  | 'auto'
  | 'mpv'
  | 'web'
  | 'rust-demux'
  | 'rust-native';

/** 全局能力探测（启动缓存） */
export type EnhanceCaps = {
  webCodecs: boolean;
  webgpu: boolean;
  webgl2: boolean;
  importExternalImage: boolean;
  /** 最小 session 1×1 真实推理；非 API 存在性 */
  ortWebgpu: boolean;
  rustDemux: boolean;
  rustNative: boolean;
  mpv: boolean;
};

/** 开流前 per-track 门禁结果 */
export type TrackCodecSupport = {
  videoOk: boolean;
  audioOk: boolean;
  videoDetail?: string;
  audioDetail?: string;
};

export type ResolveEnhanceInput = {
  prefsBackend: EnhanceBackendPref;
  webEnhanceEnabled: boolean;
  caps: EnhanceCaps;
  /** mkv / 非 fMP4 等需 demux 的容器 */
  needsDemux: boolean;
  /** 用户曾显式选过 web（持久化 backend===web） */
  webOptIn: boolean;
  trackSupport?: TrackCodecSupport;
};

export type ResolveEnhanceResult = {
  pipeline: EnhancePipelineId;
  reason: string;
  toast?: string;
};

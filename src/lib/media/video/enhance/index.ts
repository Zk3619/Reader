export type {
  EnhanceBackendPref,
  EnhanceCaps,
  EnhancePipelineId,
  ResolveEnhanceInput,
  ResolveEnhanceResult,
  TrackCodecSupport,
} from '@/lib/media/video/enhance/types';

export { MediaClock, PipelineEpoch } from '@/lib/media/video/enhance/media-clock';

export {
  clearEnhanceCapsCache,
  containerNeedsDemux,
  detectEnhanceCaps,
  getCachedEnhanceCaps,
  probeTrackCodecSupport,
} from '@/lib/media/video/enhance/caps';

export {
  allowsAnime4kRifeCascade,
  isWebPipeline,
  resolveEnhancePipeline,
} from '@/lib/media/video/enhance/router';

export {
  createWebEnhanceEngine,
  containFit,
  probeMediaRangeSupport,
} from '@/lib/media/video/enhance/web-engine';

export {
  openEnhanceRouted,
  resolveEnhanceForUrl,
} from '@/lib/media/video/enhance/open-enhance-routed';

export {
  createAnime4KWebRenderer,
  resolveAnime4KWebPass,
} from '@/lib/media/video/enhance/anime4k-webgl';

export {
  createAnime4KWebGpuRenderer,
  resolveAnime4KEffectChain,
} from '@/lib/media/video/enhance/anime4k-webgpu-renderer';

export {
  EnhanceWatchdog,
  FrameBudgetAccumulator,
} from '@/lib/media/video/enhance/watchdog';

export {
  clearOrtProbeCache,
  decideRifeCascade,
  guardRifeEpoch,
  probeOrtWebgpuRealtime,
  ensureRifeSession,
  getRifeSessionInfo,
  packRifeInput,
  resolveRifeOnnxPath,
  runRifeInterpolate,
} from '@/lib/media/video/enhance/rife-web';

export {
  demuxOpen,
  demuxPullAudio,
  demuxPullVideo,
  ensureDemuxServer,
} from '@/lib/media/video/enhance/demux-client';

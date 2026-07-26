export type {
  Anime4KMode,
  Anime4KQuality,
  PlaybackEngine,
  PlaybackEngineId,
  PlaybackLoadOptions,
  PlaybackRouteInput,
  PlaybackTrackInfo,
} from '@/lib/media/video/playback/types';

export type {
  EnhanceBackendPref,
  EnhanceCaps,
  EnhancePipelineId,
  ResolveEnhanceResult,
  TrackCodecSupport,
} from '@/lib/media/video/enhance';

export {
  MediaClock,
  PipelineEpoch,
  allowsAnime4kRifeCascade,
  clearEnhanceCapsCache,
  containerNeedsDemux,
  createWebEnhanceEngine,
  detectEnhanceCaps,
  getCachedEnhanceCaps,
  isWebPipeline,
  openEnhanceRouted,
  probeMediaRangeSupport,
  probeTrackCodecSupport,
  resolveEnhanceForUrl,
  resolveEnhancePipeline,
} from '@/lib/media/video/enhance';



export {
  buildAnime4KShaderFiles,
  joinGlslShadersArg,
  resolveShaderPaths,
  ANIME4K_BUNDLED_SHADER_FILES,
  ANIME4K_BUNDLED_SHADER_DIR_NAME,
} from '@/lib/media/video/playback/anime4k';

export {
  resolveEffectiveAnime4KShadersDir,
  probeAnime4KShadersReady,
  probeAnime4KShadersPresent,
  clearAnime4KShadersDirCache,
  ANIME4K_DEV_SHADERS_HINT,
} from '@/lib/media/video/playback/shaders-dir';

export {
  getVideoPlaybackPrefs,
  setVideoPlaybackPrefs,
  shouldDivertHubFromArtplayer,
  type VideoPlaybackPrefs,
  type LocalPlaybackEnginePref,
  type ExternalPlayerKindPref,
  type LibmpvVideoOutput,
  type LibmpvHwdecPreset,
} from '@/lib/media/video/playback/prefs';

export {
  resolveMpvLaunchOpts,
  evaluateAnime4KAvailability,
  formatEngineLabel,
  formatExternalPlayerLabel,
  formatPlaybackToastDescription,
  FORCE_ENGINE_LABELS,
  ANIME4K_MODE_LABELS,
  ANIME4K_QUALITY_LABELS,
  VIDEO_OUTPUT_LABELS,
  HWDEC_PRESET_LABELS,
  PLAYBACK_TERM_NOTES,
} from '@/lib/media/video/playback/mpv-launch';

export {
  buildExternalMpvArgs,
  buildExternalMpvArgsAsync,
  buildExternalVlcArgs,
  tryExternalMpvGetTimePos,
} from '@/lib/media/video/playback/external-mpv';

export {
  resolvePlaybackEngine,
  resolvePlaybackEngineWithPrefs,
  isLibMpvAvailable,
  probeLibMpvAvailable,
} from '@/lib/media/video/playback/router';

export {
  isArtplayerOnlyProfile,
  isEnhancedVideoProfile,
} from '@/lib/media/video/playback/video-profile';

export { createLibMpvEngine, probeLibMpvStatus } from '@/lib/media/video/playback/libmpv-engine';

export {
  applyAnime4KModeLive,
  applySubStyleLive,
  applyAudioLive,
} from '@/lib/media/video/playback/libmpv-live';

export {
  getLocalSeekThumbnail,
  getLocalSeekThumbnailDetailed,
  isLocalSeekThumbSource,
} from '@/lib/media/video/playback/local-thumb';

export { openEnhancedOrExternal } from '@/lib/media/video/playback/open-enhanced';
export { openRoutedPlayback } from '@/lib/media/video/playback/open-routed';

export { openAndroidVideoPlayer } from '@/lib/media/video/playback/android-player';

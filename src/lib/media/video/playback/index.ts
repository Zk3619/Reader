export type {
  Anime4KMode,
  Anime4KQuality,
  PlaybackEngine,
  PlaybackEngineId,
  PlaybackLoadOptions,
  PlaybackRouteInput,
  PlaybackTrackInfo,
} from '@/lib/media/video/playback/types';

export {
  buildAnime4KShaderFiles,
  joinGlslShadersArg,
  resolveShaderPaths,
  ANIME4K_BUNDLED_SHADER_FILES,
  ANIME4K_BUNDLED_SHADER_DIR_NAME,
} from '@/lib/media/video/playback/anime4k';

export {
  resolveEffectiveAnime4KShadersDir,
  clearAnime4KShadersDirCache,
} from '@/lib/media/video/playback/shaders-dir';

export {
  getVideoPlaybackPrefs,
  setVideoPlaybackPrefs,
  type VideoPlaybackPrefs,
  type LocalPlaybackEnginePref,
  type ExternalPlayerKindPref,
} from '@/lib/media/video/playback/prefs';

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

export { createLibMpvEngine, probeLibMpvStatus } from '@/lib/media/video/playback/libmpv-engine';

export { openEnhancedOrExternal } from '@/lib/media/video/playback/open-enhanced';
export { openRoutedPlayback } from '@/lib/media/video/playback/open-routed';

export { openAndroidVideoPlayer } from '@/lib/media/video/playback/android-player';

/**
 * Libmpv 会话内热更新：Anime4K / 字幕样式
 */

import { invoke } from '@tauri-apps/api/core';
import {
  joinGlslShadersArg,
  resolveShaderPaths,
} from '@/lib/media/video/playback/anime4k';
import { resolveMpvLaunchOpts } from '@/lib/media/video/playback/mpv-launch';
import { audioEqPresetToAf } from '@/lib/media/video/playback/audio-eq';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import {
  probeAnime4KShadersReady,
  resolveEffectiveAnime4KShadersDir,
} from '@/lib/media/video/playback/shaders-dir';
import type { Anime4KMode } from '@/lib/media/video/playback/types';

export async function applyAnime4KModeLive(mode: Anime4KMode): Promise<void> {
  const prefs = getVideoPlaybackPrefs();
  const launch = resolveMpvLaunchOpts({ ...prefs, anime4kMode: mode });
  if (!launch.anime4kOn) {
    await invoke('video_libmpv_set_glsl_shaders', { glslShaders: null });
    return;
  }
  const probe = await probeAnime4KShadersReady();
  if (!probe.ready) throw new Error(probe.detail);
  const dir = probe.dir || (await resolveEffectiveAnime4KShadersDir());
  const paths = resolveShaderPaths(dir, mode, prefs.anime4kQuality, {
    deblur: prefs.anime4kDeblur,
  });
  const joined = joinGlslShadersArg(paths);
  if (!joined) throw new Error('无法拼出 glsl-shaders');
  await invoke('video_libmpv_set_glsl_shaders', { glslShaders: joined });
}

export async function applySubStyleLive(): Promise<void> {
  const prefs = getVideoPlaybackPrefs();
  await invoke('video_libmpv_set_sub_style', {
    font: prefs.subFont.trim() || null,
    fontSize: prefs.subFontSize > 0 ? prefs.subFontSize : null,
    scale: prefs.subScale > 0 ? prefs.subScale : null,
  });
}

export async function applyAudioLive(): Promise<void> {
  const prefs = getVideoPlaybackPrefs();
  await invoke('video_libmpv_set_audio', {
    volume: prefs.volume,
    muted: prefs.muted,
    listenOnly: prefs.listenOnly,
  });
}

export async function applyAudioEqLive(): Promise<void> {
  const prefs = getVideoPlaybackPrefs();
  const af = audioEqPresetToAf(prefs.audioEqPreset);
  await invoke('video_libmpv_set_af', { af });
}

/** 热切 RIFE / 清空 vf；与 Anime4K 互斥由 prefs 保证 */
export async function applyFrameInterpLive(): Promise<void> {
  const prefs = getVideoPlaybackPrefs();
  if (!prefs.frameInterpEnabled) {
    await invoke('video_libmpv_set_video_filter', {
      videoFilter: null,
      lightweightInterp: false,
    });
    return;
  }
  const { probeRifeStatus } = await import('@/lib/media/video/playback/rife-probe');
  const {
    buildRifeVapoursynthVf,
    resolveFrameInterpBackend,
  } = await import('@/lib/media/video/playback/frame-interp');
  const probe = await probeRifeStatus();
  const backend = resolveFrameInterpBackend(prefs.frameInterpBackend, probe);
  if (backend && probe.scriptPath) {
    await invoke('video_libmpv_set_glsl_shaders', { glslShaders: null });
    await invoke('video_libmpv_set_video_filter', {
      videoFilter: buildRifeVapoursynthVf({
        scriptPath: probe.scriptPath,
        backend,
        factor: prefs.frameInterpFactor,
        model: prefs.frameInterpModel,
        sceneDetect: prefs.frameInterpSceneDetect,
        maxInputFps: prefs.frameInterpMaxInputFps,
      }),
      lightweightInterp: false,
    });
    return;
  }
  if (prefs.frameInterpLightweightFallback) {
    await invoke('video_libmpv_set_video_filter', {
      videoFilter: null,
      lightweightInterp: true,
    });
    return;
  }
  throw new Error(probe.detail || 'RIFE 不可用');
}

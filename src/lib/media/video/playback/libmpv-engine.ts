/**
 * 桌面 libmpv 引擎适配（E2.1+）：经 Tauri invoke；无 feature / 缺库时 load 抛错供路由回退
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
  applyFrameInterpLaunchOverrides,
  buildRifeVapoursynthVf,
  resolveFrameInterpBackend,
} from '@/lib/media/video/playback/frame-interp';
import { probeRifeStatus } from '@/lib/media/video/playback/rife-probe';
import {
  probeAnime4KShadersReady,
  resolveEffectiveAnime4KShadersDir,
} from '@/lib/media/video/playback/shaders-dir';
import type {
  PlaybackEngine,
  PlaybackLoadOptions,
  PlaybackTrackInfo,
} from '@/lib/media/video/playback/types';

async function resolveVideoFilterArgs(): Promise<{
  videoFilter: string | null;
  lightweightInterp: boolean;
}> {
  const prefs = getVideoPlaybackPrefs();
  if (!prefs.frameInterpEnabled) {
    return { videoFilter: null, lightweightInterp: false };
  }
  const probe = await probeRifeStatus();
  const backend = resolveFrameInterpBackend(prefs.frameInterpBackend, probe);
  if (backend && probe.scriptPath) {
    return {
      videoFilter: buildRifeVapoursynthVf({
        scriptPath: probe.scriptPath,
        backend,
        factor: prefs.frameInterpFactor,
        model: prefs.frameInterpModel,
        sceneDetect: prefs.frameInterpSceneDetect,
        maxInputFps: prefs.frameInterpMaxInputFps,
      }),
      lightweightInterp: false,
    };
  }
  if (prefs.frameInterpLightweightFallback) {
    return { videoFilter: null, lightweightInterp: true };
  }
  throw new Error(
    probe.detail ||
      'RIFE 不可用（请放置 models/rife_ncnn、rife_dml 或 rife_trt，见 resources/rife/README）',
  );
}

function httpHeaderFields(
  headers?: Record<string, string>,
): string[] | null {
  if (!headers) return null;
  const fields = Object.entries(headers)
    .map(([k, v]) => {
      const key = k.trim();
      const val = String(v ?? '').trim();
      if (!key || !val) return '';
      return `${key}: ${val}`;
    })
    .filter(Boolean);
  return fields.length ? fields : null;
}

async function buildGlslShadersArg(opts: PlaybackLoadOptions): Promise<string | null> {
  const prefs = getVideoPlaybackPrefs();
  const launch = resolveMpvLaunchOpts(prefs, {
    anime4kMode: opts.anime4k?.mode ?? prefs.anime4kMode,
  });
  if (!launch.anime4kOn) return null;

  const quality = opts.anime4k?.quality ?? prefs.anime4kQuality;
  const mode = opts.anime4k?.mode ?? prefs.anime4kMode;

  const probe = await probeAnime4KShadersReady();
  if (!probe.ready) {
    throw new Error(`Anime4K 不可用：${probe.detail}`);
  }
  const dir = probe.dir || (await resolveEffectiveAnime4KShadersDir());
  const paths = resolveShaderPaths(dir, mode, quality, {
    deblur: prefs.anime4kDeblur,
  });
  const joined = joinGlslShadersArg(paths);
  if (!joined) {
    throw new Error('Anime4K 已开启但未能拼出 glsl-shaders 链');
  }
  return joined;
}

export function createLibMpvEngine(): PlaybackEngine {
  return {
    id: 'libmpv',
    async load(opts: PlaybackLoadOptions) {
      const prefs = getVideoPlaybackPrefs();
      const override = applyFrameInterpLaunchOverrides(prefs);
      const launch = resolveMpvLaunchOpts(
        override ? { ...prefs, ...override } : prefs,
        {
          anime4kMode: prefs.frameInterpEnabled
            ? 'off'
            : opts.anime4k?.mode ?? prefs.anime4kMode,
        },
      );
      const glslShaders = prefs.frameInterpEnabled
        ? null
        : await buildGlslShadersArg(opts);
      const { videoFilter, lightweightInterp } = await resolveVideoFilterArgs();
      await invoke('video_libmpv_open_window', {
        url: opts.url,
        title: opts.title ?? null,
        startSec: opts.startSec ?? null,
        subtitle: opts.subtitle ?? null,
        glslShaders,
        hwdec: launch.hwdec,
        gpuNext: launch.useGpuNext,
        audioTrack:
          opts.audioTrack != null && opts.audioTrack !== ''
            ? String(opts.audioTrack)
            : null,
        httpHeaders: httpHeaderFields(opts.headers),
        subFont: prefs.subFont.trim() || null,
        subFontSize: prefs.subFontSize > 0 ? prefs.subFontSize : null,
        subScale: prefs.subScale > 0 ? prefs.subScale : null,
        toneMapping: prefs.hdrToneMapping || 'auto',
        targetColorspaceHint: prefs.hdrTargetColorspaceHint,
        volume: prefs.volume,
        muted: prefs.muted,
        listenOnly: prefs.listenOnly,
        af: audioEqPresetToAf(prefs.audioEqPreset),
        videoFilter,
        lightweightInterp,
      });
    },
    async play() {
      await invoke('video_libmpv_pause', { paused: false });
    },
    async pause() {
      await invoke('video_libmpv_pause', { paused: true });
    },
    async seek(sec: number) {
      await invoke('video_libmpv_seek', { sec });
    },
    async getPosition() {
      try {
        return await invoke<number>('video_libmpv_get_time_pos');
      } catch {
        return 0;
      }
    },
    async getDuration() {
      try {
        return await invoke<number>('video_libmpv_get_duration');
      } catch {
        return 0;
      }
    },
    async listAudioTracks(): Promise<PlaybackTrackInfo[]> {
      try {
        return await invoke<PlaybackTrackInfo[]>('video_libmpv_list_tracks', {
          kind: 'audio',
        });
      } catch {
        return [];
      }
    },
    async listSubtitleTracks(): Promise<PlaybackTrackInfo[]> {
      try {
        return await invoke<PlaybackTrackInfo[]>('video_libmpv_list_tracks', {
          kind: 'sub',
        });
      } catch {
        return [];
      }
    },
    async setAudioTrack(id: string) {
      await invoke('video_libmpv_set_track', { kind: 'audio', id });
    },
    async setSubtitleTrack(id: string) {
      await invoke('video_libmpv_set_track', { kind: 'sub', id });
    },
    async destroy() {
      try {
        await invoke('video_libmpv_close');
      } catch {
        /* */
      }
    },
  };
}

export async function probeLibMpvStatus(): Promise<{
  available: boolean;
  featureEnabled: boolean;
  detail: string;
}> {
  try {
    return await invoke('video_libmpv_status');
  } catch (e) {
    return {
      available: false,
      featureEnabled: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

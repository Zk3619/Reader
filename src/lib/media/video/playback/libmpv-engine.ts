/**
 * 桌面 libmpv 引擎适配（E2.1+）：经 Tauri invoke；无 feature / 缺库时 load 抛错供路由回退
 */

import { invoke } from '@tauri-apps/api/core';
import {
  joinGlslShadersArg,
  resolveShaderPaths,
} from '@/lib/media/video/playback/anime4k';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import { resolveEffectiveAnime4KShadersDir } from '@/lib/media/video/playback/shaders-dir';
import type {
  PlaybackEngine,
  PlaybackLoadOptions,
  PlaybackTrackInfo,
} from '@/lib/media/video/playback/types';

async function buildGlslShadersArg(opts: PlaybackLoadOptions): Promise<string | null> {
  const prefs = getVideoPlaybackPrefs();
  // gpu-next 与 Anime4K 互斥
  if (prefs.libmpvGpuNext) return null;
  const mode = opts.anime4k?.mode ?? prefs.anime4kMode;
  const quality = opts.anime4k?.quality ?? prefs.anime4kQuality;
  if (mode === 'off') return null;
  const dir = await resolveEffectiveAnime4KShadersDir();
  const paths = resolveShaderPaths(dir, mode, quality, {
    deblur: prefs.anime4kDeblur,
  });
  const joined = joinGlslShadersArg(paths);
  return joined || null;
}

export function createLibMpvEngine(): PlaybackEngine {
  return {
    id: 'libmpv',
    async load(opts: PlaybackLoadOptions) {
      const prefs = getVideoPlaybackPrefs();
      await invoke('video_libmpv_open_window', {
        url: opts.url,
        title: opts.title ?? null,
        startSec: opts.startSec ?? null,
        subtitle: opts.subtitle ?? null,
        glslShaders: await buildGlslShadersArg(opts),
        hwdec: prefs.libmpvHwdec || null,
        gpuNext: prefs.libmpvGpuNext,
        audioTrack:
          opts.audioTrack != null && opts.audioTrack !== ''
            ? String(opts.audioTrack)
            : null,
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

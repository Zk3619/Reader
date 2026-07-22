/**
 * 桌面 libmpv 引擎适配（E2.1）：经 Tauri invoke；无 feature / 缺库时 load 抛错供路由回退
 */

import { invoke } from '@tauri-apps/api/core';
import {
  joinGlslShadersArg,
  resolveShaderPaths,
} from '@/lib/media/video/playback/anime4k';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import type {
  PlaybackEngine,
  PlaybackLoadOptions,
  PlaybackTrackInfo,
} from '@/lib/media/video/playback/types';

function buildGlslShadersArg(opts: PlaybackLoadOptions): string | null {
  const prefs = getVideoPlaybackPrefs();
  const mode = opts.anime4k?.mode ?? prefs.anime4kMode;
  const quality = opts.anime4k?.quality ?? prefs.anime4kQuality;
  const paths = resolveShaderPaths(prefs.anime4kShadersDir, mode, quality);
  const joined = joinGlslShadersArg(paths);
  return joined || null;
}

export function createLibMpvEngine(): PlaybackEngine {
  return {
    id: 'libmpv',
    async load(opts: PlaybackLoadOptions) {
      await invoke('video_libmpv_open_window', {
        url: opts.url,
        title: opts.title ?? null,
        startSec: opts.startSec ?? null,
        subtitle: opts.subtitle ?? null,
        glslShaders: buildGlslShadersArg(opts),
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
      return 0;
    },
    async listAudioTracks(): Promise<PlaybackTrackInfo[]> {
      return [];
    },
    async listSubtitleTracks(): Promise<PlaybackTrackInfo[]> {
      return [];
    },
    async setAudioTrack(_id: string) {},
    async setSubtitleTrack(_id: string) {},
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

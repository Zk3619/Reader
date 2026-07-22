/**
 * 外置 mpv 深度交接：启动参数 + IPC 尽力回读
 */

import {
  joinGlslShadersArg,
  resolveShaderPaths,
} from '@/lib/media/video/playback/anime4k';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import type { PlaybackLoadOptions } from '@/lib/media/video/playback/types';

export type ExternalMpvLaunch = {
  args: string[];
  ipcPath: string | null;
};

function ipcServerPath(): string {
  // Windows named pipe；类 Unix 用 /tmp。实际路径由 Rust 侧也可覆盖；此处给 spawn 用。
  const id = `reader-mpv-${Date.now()}`;
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || '')) {
    return `\\\\.\\pipe\\${id}`;
  }
  return `/tmp/${id}.sock`;
}

/** 组装 mpv CLI 参数（不含可执行名） */
export function buildExternalMpvArgs(
  url: string,
  opts?: Partial<PlaybackLoadOptions>,
): ExternalMpvLaunch {
  const prefs = getVideoPlaybackPrefs();
  const args: string[] = [];
  let ipcPath: string | null = null;

  if (prefs.externalIpcEnabled) {
    ipcPath = ipcServerPath();
    args.push(`--input-ipc-server=${ipcPath}`);
  }

  const sub = opts?.subtitle?.trim() || prefs.preferredSubtitlePath.trim();
  if (sub) args.push(`--sub-file=${sub}`);

  if (opts?.audioTrack != null && opts.audioTrack !== '') {
    args.push(`--aid=${String(opts.audioTrack)}`);
  }

  if (opts?.startSec != null && Number.isFinite(opts.startSec) && opts.startSec > 0) {
    args.push(`--start=${opts.startSec}`);
  }

  const mode = opts?.anime4k?.mode ?? prefs.anime4kMode;
  const quality = opts?.anime4k?.quality ?? prefs.anime4kQuality;
  const shaders = resolveShaderPaths(prefs.anime4kShadersDir, mode, quality);
  const glsl = joinGlslShadersArg(shaders);
  if (glsl) args.push(`--glsl-shaders=${glsl}`);

  if (opts?.title?.trim()) {
    args.push(`--force-media-title=${opts.title.trim()}`);
  }

  args.push('--', url);
  return { args, ipcPath };
}

/** VLC 简化参数 */
export function buildExternalVlcArgs(url: string, subtitle?: string): string[] {
  const args: string[] = [];
  const sub = subtitle?.trim() || getVideoPlaybackPrefs().preferredSubtitlePath.trim();
  if (sub) args.push(`--sub-file=${sub}`);
  args.push(url);
  return args;
}

/**
 * 尽力通过 IPC 读 time-pos（需本机 socat/mpv 支持；失败返回 null）
 * 桌面完整实现由 Rust `video_mpv_ipc_get` 提供；此处为 TS 占位探测。
 */
export async function tryExternalMpvGetTimePos(_ipcPath: string): Promise<number | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const pos = await invoke<number | null>('video_mpv_ipc_get_time_pos', {
      ipcPath: _ipcPath,
    });
    return typeof pos === 'number' && Number.isFinite(pos) ? pos : null;
  } catch {
    return null;
  }
}

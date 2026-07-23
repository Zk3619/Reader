/**
 * 外置 mpv 深度交接：启动参数 + IPC 尽力回读
 */

import {
  joinGlslShadersArg,
  resolveShaderPaths,
} from '@/lib/media/video/playback/anime4k';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import { resolveEffectiveAnime4KShadersDir } from '@/lib/media/video/playback/shaders-dir';
import type { PlaybackLoadOptions } from '@/lib/media/video/playback/types';

export type ExternalMpvLaunch = {
  args: string[];
  ipcPath: string | null;
};

function ipcServerPath(): string {
  const id = `reader-mpv-${Date.now()}`;
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || '')) {
    return `\\\\.\\pipe\\${id}`;
  }
  return `/tmp/${id}.sock`;
}

function isWindows(): boolean {
  return typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || '');
}

/** 组装 mpv CLI 参数（不含可执行名）；shadersDir 空则仅用文件名 */
export function buildExternalMpvArgs(
  url: string,
  opts?: Partial<PlaybackLoadOptions> & { shadersDir?: string },
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

  // gpu-next 与 Anime4K 互斥：开 gpu-next 时不传 shaders
  const mode = opts?.anime4k?.mode ?? prefs.anime4kMode;
  const quality = opts?.anime4k?.quality ?? prefs.anime4kQuality;
  if (!prefs.libmpvGpuNext && mode !== 'off') {
    const dir = opts?.shadersDir ?? prefs.anime4kShadersDir;
    const shaders = resolveShaderPaths(dir, mode, quality, {
      deblur: prefs.anime4kDeblur,
    });
    const glsl = joinGlslShadersArg(shaders, { windows: isWindows() });
    if (glsl) args.push(`--glsl-shaders=${glsl}`);
  }

  if (prefs.libmpvGpuNext) {
    args.push('--vo=gpu-next');
  }

  const hwdec = prefs.libmpvHwdec.trim();
  if (hwdec) args.push(`--hwdec=${hwdec}`);

  if (opts?.title?.trim()) {
    args.push(`--force-media-title=${opts.title.trim()}`);
  }

  args.push('--', url);
  return { args, ipcPath };
}

/** 异步解析捆绑 shaders 目录后再组装参数 */
export async function buildExternalMpvArgsAsync(
  url: string,
  opts?: Partial<PlaybackLoadOptions>,
): Promise<ExternalMpvLaunch> {
  const shadersDir = await resolveEffectiveAnime4KShadersDir();
  return buildExternalMpvArgs(url, { ...opts, shadersDir });
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

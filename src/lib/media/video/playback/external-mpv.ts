/**
 * 外置 mpv 深度交接：启动参数 + IPC 尽力回读
 */

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
import type { RifeProbeStatus } from '@/lib/media/video/playback/frame-interp';
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
  opts?: Partial<PlaybackLoadOptions> & {
    shadersDir?: string;
    rifeProbe?: RifeProbeStatus | null;
  },
): ExternalMpvLaunch {
  const prefs = getVideoPlaybackPrefs();
  const override = applyFrameInterpLaunchOverrides(prefs);
  const effective = override ? { ...prefs, ...override } : prefs;
  const launch = resolveMpvLaunchOpts(effective, {
    anime4kMode: prefs.frameInterpEnabled
      ? 'off'
      : opts?.anime4k?.mode ?? prefs.anime4kMode,
  });
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

  const subFont = prefs.subFont.trim();
  if (subFont) args.push(`--sub-font=${subFont}`);
  if (prefs.subFontSize > 0) args.push(`--sub-font-size=${prefs.subFontSize}`);
  if (prefs.subScale > 0) args.push(`--sub-scale=${prefs.subScale}`);

  const tm = prefs.hdrToneMapping.trim();
  if (tm && tm !== 'auto') args.push(`--tone-mapping=${tm}`);
  args.push(
    prefs.hdrTargetColorspaceHint
      ? '--target-colorspace-hint=yes'
      : '--target-colorspace-hint=no',
  );

  const vol = Math.max(0, Math.min(100, prefs.volume));
  args.push(`--volume=${vol}`);
  if (prefs.muted) args.push('--mute=yes');
  if (prefs.listenOnly) args.push('--vid=no');

  const af = audioEqPresetToAf(prefs.audioEqPreset);
  if (af) args.push(`--af=${af}`);

  if (launch.anime4kOn && !prefs.frameInterpEnabled) {
    const mode = opts?.anime4k?.mode ?? prefs.anime4kMode;
    const quality = opts?.anime4k?.quality ?? prefs.anime4kQuality;
    const dir = opts?.shadersDir ?? prefs.anime4kShadersDir;
    if (!dir?.trim()) {
      throw new Error(
        'Anime4K 已开启但 Shaders 目录为空（外置 MPV 需要绝对路径；请留空以使用捆绑目录，或在设置中填写）',
      );
    }
    const shaders = resolveShaderPaths(dir, mode, quality, {
      deblur: prefs.anime4kDeblur,
    });
    const glsl = joinGlslShadersArg(shaders, { windows: isWindows() });
    if (glsl) args.push(`--glsl-shaders=${glsl}`);
  }

  if (prefs.frameInterpEnabled && opts?.rifeProbe) {
    const backend = resolveFrameInterpBackend(
      prefs.frameInterpBackend,
      opts.rifeProbe,
    );
    if (backend && opts.rifeProbe.scriptPath) {
      const vf = buildRifeVapoursynthVf({
        scriptPath: opts.rifeProbe.scriptPath,
        backend,
        factor: prefs.frameInterpFactor,
        model: prefs.frameInterpModel,
        sceneDetect: prefs.frameInterpSceneDetect,
        maxInputFps: prefs.frameInterpMaxInputFps,
      });
      args.push(`--vf=${vf}`);
    } else if (prefs.frameInterpLightweightFallback) {
      args.push('--interpolation=yes', '--video-sync=display-resample');
    }
  }

  args.push(launch.useGpuNext ? '--vo=gpu-next' : '--vo=gpu');

  if (launch.hwdec) {
    args.push(`--hwdec=${launch.hwdec}`);
  }

  if (opts?.title?.trim()) {
    args.push(`--force-media-title=${opts.title.trim()}`);
  }

  if (opts?.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      const key = k.trim();
      const val = String(v ?? '').trim();
      if (!key || !val) continue;
      args.push(`--http-header-fields=${key}: ${val}`);
    }
  }

  args.push('--', url);
  return { args, ipcPath };
}

/** 异步解析捆绑 shaders 目录后再组装参数 */
export async function buildExternalMpvArgsAsync(
  url: string,
  opts?: Partial<PlaybackLoadOptions>,
): Promise<ExternalMpvLaunch> {
  const prefs = getVideoPlaybackPrefs();
  let rifeProbe = null as RifeProbeStatus | null;
  if (prefs.frameInterpEnabled) {
    const { probeRifeStatus } = await import('@/lib/media/video/playback/rife-probe');
    rifeProbe = await probeRifeStatus();
    const backend = resolveFrameInterpBackend(prefs.frameInterpBackend, rifeProbe);
    if (!backend && !prefs.frameInterpLightweightFallback) {
      throw new Error(rifeProbe.detail || 'RIFE 不可用');
    }
  }
  const launch = resolveMpvLaunchOpts(prefs, {
    anime4kMode: prefs.frameInterpEnabled
      ? 'off'
      : opts?.anime4k?.mode ?? prefs.anime4kMode,
  });
  if (launch.anime4kOn) {
    const { probeAnime4KShadersReady } = await import(
      '@/lib/media/video/playback/shaders-dir'
    );
    const probe = await probeAnime4KShadersReady();
    if (!probe.ready) {
      throw new Error(`Anime4K 不可用：${probe.detail}`);
    }
    return buildExternalMpvArgs(url, {
      ...opts,
      shadersDir: probe.dir,
      rifeProbe,
    });
  }
  const shadersDir = await resolveEffectiveAnime4KShadersDir();
  return buildExternalMpvArgs(url, { ...opts, shadersDir, rifeProbe });
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

/**
 * 增强能力探测（两层：全局缓存 + per-track）
 * @see docs/VIDEO_WEB_ENHANCE.md
 */

import type { EnhanceCaps, TrackCodecSupport } from '@/lib/media/video/enhance/types';

let cachedCaps: EnhanceCaps | null = null;
let capsPromise: Promise<EnhanceCaps> | null = null;

function probeWebGl2(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

function probeImportExternalImage(): boolean {
  try {
    return (
      typeof GPUDevice !== 'undefined' &&
      typeof (GPUDevice.prototype as { importExternalTexture?: unknown }).importExternalTexture ===
        'function'
    );
  } catch {
    return false;
  }
}

async function probeOrtWebgpu(): Promise<boolean> {
  try {
    const { probeOrtWebgpuRealtime } = await import('@/lib/media/video/enhance/rife-web');
    return await probeOrtWebgpuRealtime();
  } catch {
    return false;
  }
}

async function probeRustDemux(): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const st = await invoke<{ available?: boolean }>('video_demux_status').catch(() => null);
    return !!st?.available;
  } catch {
    return false;
  }
}

async function probeRustNative(): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const st = await invoke<{ available?: boolean }>('video_native_enhance_status').catch(
      () => null,
    );
    return !!st?.available;
  } catch {
    return false;
  }
}

async function probeMpv(): Promise<boolean> {
  try {
    const { probeLibMpvAvailable } = await import('@/lib/media/video/playback/router');
    return await probeLibMpvAvailable();
  } catch {
    return false;
  }
}

export async function detectEnhanceCaps(force = false): Promise<EnhanceCaps> {
  if (!force && cachedCaps) return cachedCaps;
  if (!force && capsPromise) return capsPromise;

  capsPromise = (async () => {
    const webCodecs = typeof VideoDecoder !== 'undefined' && typeof AudioDecoder !== 'undefined';
    const webgpu = 'gpu' in navigator;
    const [ortWebgpu, rustDemux, rustNative, mpv] = await Promise.all([
      probeOrtWebgpu(),
      probeRustDemux(),
      probeRustNative(),
      probeMpv(),
    ]);
    const caps: EnhanceCaps = {
      webCodecs,
      webgpu,
      webgl2: probeWebGl2(),
      importExternalImage: probeImportExternalImage(),
      ortWebgpu,
      rustDemux,
      rustNative,
      mpv,
    };
    cachedCaps = caps;
    return caps;
  })();

  return capsPromise;
}

export function getCachedEnhanceCaps(): EnhanceCaps | null {
  return cachedCaps;
}

export function clearEnhanceCapsCache(): void {
  cachedCaps = null;
  capsPromise = null;
}

/** 开流前 per-track：视频 + 音频同等探测 */
export async function probeTrackCodecSupport(opts: {
  video?: VideoDecoderConfig;
  audio?: AudioDecoderConfig;
}): Promise<TrackCodecSupport> {
  const out: TrackCodecSupport = { videoOk: true, audioOk: true };

  if (opts.video) {
    if (typeof VideoDecoder === 'undefined') {
      out.videoOk = false;
      out.videoDetail = 'VideoDecoder unavailable';
    } else {
      try {
        const r = await VideoDecoder.isConfigSupported(opts.video);
        out.videoOk = !!r.supported;
        if (!out.videoOk) out.videoDetail = `unsupported video: ${opts.video.codec}`;
      } catch (e) {
        out.videoOk = false;
        out.videoDetail = e instanceof Error ? e.message : String(e);
      }
    }
  }

  if (opts.audio) {
    if (typeof AudioDecoder === 'undefined') {
      out.audioOk = false;
      out.audioDetail = 'AudioDecoder unavailable';
    } else {
      try {
        const r = await AudioDecoder.isConfigSupported(opts.audio);
        out.audioOk = !!r.supported;
        if (!out.audioOk) out.audioDetail = `unsupported audio: ${opts.audio.codec}`;
      } catch (e) {
        out.audioOk = false;
        out.audioDetail = e instanceof Error ? e.message : String(e);
      }
    }
  }

  return out;
}

/** 容器是否需要 Rust demux（mkv 等；HLS 不在此列） */
export function containerNeedsDemux(urlOrPath: string, mimeHint?: string): boolean {
  const s = (urlOrPath || '').toLowerCase();
  const m = (mimeHint || '').toLowerCase();
  if (/\.m3u8(\?|#|$)/.test(s) || m.includes('mpegurl') || m.includes('m3u8')) {
    return false;
  }
  if (/\.(mkv|webm|ts|m2ts|mts)(\?|#|$)/.test(s)) return true;
  if (m.includes('matroska') || m.includes('x-matroska')) return true;
  return false;
}

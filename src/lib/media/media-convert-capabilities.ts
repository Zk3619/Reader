/**
 * 媒体格式转换能力探测（按平台自动降级）
 *
 * - Tauri：图片 Rust（image）；音频仅 `--features media-ffmpeg` 构建时可用
 * - Web：Canvas（图片）；音频仅 VITE_ENABLE_FFMPEG_WASM 时可选 ffmpeg.wasm
 */

import { isTauri } from '@/lib/platform/detect';
import { resolveFsPlatform } from '@/lib/platform/fs/capabilities';

export type MediaConvertBackend = 'rust' | 'canvas' | 'ffmpeg-wasm' | 'none';

export type ImageConvertFormat = 'jpeg' | 'png' | 'webp';
export type AudioConvertFormat = 'mp3' | 'm4a';

export interface MediaConvertCapabilitySlice {
  available: boolean;
  backends: MediaConvertBackend[];
  formats: string[];
  preferred: MediaConvertBackend;
  hint?: string;
}

export interface ResolvedMediaConvertCapabilities {
  image: MediaConvertCapabilitySlice;
  audio: MediaConvertCapabilitySlice;
  video: MediaConvertCapabilitySlice;
  platform: ReturnType<typeof resolveFsPlatform>;
}

type TauriProbe = {
  imageBackend: string;
  audioBackend: string;
  videoBackend: string;
  imageFormats: string[];
  audioFormats: string[];
};

let cached: ResolvedMediaConvertCapabilities | null = null;
let probePromise: Promise<ResolvedMediaConvertCapabilities> | null = null;

function slice(
  backends: MediaConvertBackend[],
  formats: string[],
  hint?: string,
): MediaConvertCapabilitySlice {
  const preferred = backends[0] ?? 'none';
  return {
    available: backends.length > 0 && formats.length > 0,
    backends,
    formats,
    preferred,
    hint,
  };
}

function webImageCapabilities(): MediaConvertCapabilitySlice {
  if (typeof document === 'undefined') {
    return slice([], [], '当前环境不支持图片格式转换');
  }
  const formats: ImageConvertFormat[] = ['jpeg', 'png'];
  const canvas = document.createElement('canvas');
  const canWebp =
    canvas.toDataURL('image/webp').startsWith('data:image/webp');
  if (canWebp) formats.push('webp');
  return slice(
    ['canvas'],
    formats,
    '可在导出时转换图片格式，具体取决于当前浏览器的支持情况',
  );
}

async function probeFfmpegWasm(): Promise<boolean> {
  if (import.meta.env.VITE_ENABLE_FFMPEG_WASM !== 'true') {
    return false;
  }
  try {
    const { probeFfmpegWasmRuntime } = await import('@/lib/media/ffmpeg-wasm-convert');
    return await probeFfmpegWasmRuntime();
  } catch {
    return false;
  }
}

async function webAudioCapabilities(): Promise<MediaConvertCapabilitySlice> {
  const wasmOk = await probeFfmpegWasm();
  if (wasmOk) {
    return slice(
      ['ffmpeg-wasm'],
      ['mp3', 'm4a'],
      '可在导出时转换音频格式，首次使用可能需要稍长加载时间',
    );
  }
  return slice(
    [],
    [],
    '按缓存时的原始格式导出，不转换、不改文件名后缀',
  );
}

async function tauriCapabilities(): Promise<ResolvedMediaConvertCapabilities> {
  const platform = resolveFsPlatform();
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const probe = await invoke<TauriProbe>('media_convert_probe');
    const imageBackends: MediaConvertBackend[] =
      probe.imageBackend === 'rust' ? ['rust'] : [];
    const audioBackends: MediaConvertBackend[] =
      probe.audioBackend === 'rust' ? ['rust'] : [];
    const imageFormats = probe.imageFormats?.length
      ? probe.imageFormats
      : ['jpeg', 'png', 'webp'];
    const audioFormats = probe.audioFormats ?? [];

    return {
      platform,
      image: slice(
        imageBackends,
        imageFormats,
        imageBackends.includes('rust')
          ? '可在导出时转换图片格式'
          : '按缓存时的图片格式导出',
      ),
      audio: slice(
        audioBackends,
        audioFormats,
        audioBackends.includes('rust')
          ? '可在导出时将音频转换为 MP3 或 M4A'
          : '按缓存时的原始格式导出，不转换、不改文件名后缀',
      ),
      video: slice([], [], '暂不支持视频格式转换'),
    };
  } catch {
    return {
      platform,
      image: slice(
        isTauri() ? ['rust'] : [],
        ['jpeg', 'png', 'webp'],
        '将尝试在导出时转换图片格式',
      ),
      audio: slice([], [], '按缓存时的原始格式导出'),
      video: slice([], [], '暂不支持视频格式转换'),
    };
  }
}

export async function resolveMediaConvertCapabilities(
  force = false,
): Promise<ResolvedMediaConvertCapabilities> {
  if (!force && cached) return cached;
  if (!force && probePromise) return probePromise;

  probePromise = (async () => {
    if (isTauri()) {
      cached = await tauriCapabilities();
      return cached;
    }
    cached = {
      platform: 'web',
      image: webImageCapabilities(),
      audio: await webAudioCapabilities(),
      video: slice([], [], 'Web 端暂不支持视频格式转换'),
    };
    return cached;
  })();

  try {
    return await probePromise;
  } finally {
    probePromise = null;
  }
}

export function getCachedMediaConvertCapabilities(): ResolvedMediaConvertCapabilities | null {
  return cached;
}

export function resetMediaConvertCapabilitiesCache(): void {
  cached = null;
  probePromise = null;
}

export function supportsImageTargetFormat(
  caps: ResolvedMediaConvertCapabilities,
  format: 'original' | ImageConvertFormat,
): boolean {
  if (format === 'original') return true;
  return caps.image.formats.includes(format);
}

export function supportsAudioTargetFormat(
  caps: ResolvedMediaConvertCapabilities,
  format: 'original' | AudioConvertFormat,
): boolean {
  if (format === 'original') return true;
  return caps.audio.formats.includes(format);
}

export function imageConversionEnabled(
  caps: ResolvedMediaConvertCapabilities,
): boolean {
  return caps.image.available;
}

export function audioConversionEnabled(
  caps: ResolvedMediaConvertCapabilities,
): boolean {
  return caps.audio.available;
}

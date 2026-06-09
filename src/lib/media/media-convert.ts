/**
 * 媒体格式转换统一门面（自动降级：Rust → Canvas / ffmpeg.wasm → 原样输出）
 */

import type { AudioTargetFormat } from '@/lib/export/cache-export-types';
import {
  convertImageWithCanvas,
  type ImageTargetFormat,
} from '@/lib/export/image-format-convert';
import {
  resolveMediaConvertCapabilities,
  type AudioConvertFormat,
  type ImageConvertFormat,
  type ResolvedMediaConvertCapabilities,
} from '@/lib/media/media-convert-capabilities';
import { convertAudioWithFfmpegWasm } from '@/lib/media/ffmpeg-wasm-convert';

type ConvertResult = { bytes: ArrayBuffer; mime: string };

async function convertImageRust(
  bytes: ArrayBuffer,
  target: ImageConvertFormat,
): Promise<ConvertResult | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ bytes: number[]; mime: string }>(
      'convert_image_bytes',
      { bytes: [...new Uint8Array(bytes)], target },
    );
    const out = new Uint8Array(result.bytes);
    return {
      bytes: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength),
      mime: result.mime,
    };
  } catch {
    return null;
  }
}

async function convertAudioRust(
  bytes: ArrayBuffer,
  target: AudioConvertFormat,
): Promise<ConvertResult | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ bytes: number[]; mime: string }>(
      'convert_audio_bytes',
      { bytes: [...new Uint8Array(bytes)], target },
    );
    const out = new Uint8Array(result.bytes);
    return {
      bytes: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength),
      mime: result.mime,
    };
  } catch {
    return null;
  }
}

function toAudioTarget(format: AudioTargetFormat): AudioConvertFormat | null {
  if (format === 'original') return null;
  return format;
}

export async function convertImageForExport(
  bytes: ArrayBuffer,
  sourceMime: string,
  target: ImageTargetFormat,
  caps?: ResolvedMediaConvertCapabilities,
): Promise<ConvertResult> {
  if (target === 'original') {
    return { bytes, mime: sourceMime || 'image/jpeg' };
  }

  const capabilities = caps ?? (await resolveMediaConvertCapabilities());
  const backends = capabilities.image.backends;

  if (backends.includes('rust')) {
    const rust = await convertImageRust(bytes, target);
    if (rust) return rust;
  }

  if (backends.includes('canvas')) {
    const canvas = await convertImageWithCanvas(bytes, sourceMime, target);
    return canvas;
  }

  return { bytes, mime: sourceMime || 'image/jpeg' };
}

export async function convertAudioForExport(
  bytes: ArrayBuffer,
  sourceMime: string,
  target: AudioTargetFormat,
  caps?: ResolvedMediaConvertCapabilities,
): Promise<ConvertResult> {
  if (target === 'original') {
    return { bytes, mime: sourceMime || 'audio/mpeg' };
  }

  const audioTarget = toAudioTarget(target);
  if (!audioTarget) {
    return { bytes, mime: sourceMime || 'audio/mpeg' };
  }

  const capabilities = caps ?? (await resolveMediaConvertCapabilities());
  const backends = capabilities.audio.backends;

  if (backends.includes('rust')) {
    const rust = await convertAudioRust(bytes, audioTarget);
    if (rust) return rust;
  }

  if (backends.includes('ffmpeg-wasm')) {
    const wasm = await convertAudioWithFfmpegWasm(bytes, audioTarget);
    if (wasm) return wasm;
  }

  return { bytes, mime: sourceMime || 'application/octet-stream' };
}

export {
  resolveMediaConvertCapabilities,
  imageConversionEnabled,
  audioConversionEnabled,
  supportsImageTargetFormat,
  supportsAudioTargetFormat,
} from '@/lib/media/media-convert-capabilities';

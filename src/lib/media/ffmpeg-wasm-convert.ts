/**
 * Web 端可选 ffmpeg.wasm 音频转码（需 VITE_ENABLE_FFMPEG_WASM=true 且安装 @ffmpeg/ffmpeg）
 */

import type { AudioConvertFormat } from '@/lib/media/media-convert-capabilities';

type FfmpegInstance = {
  load: (opts?: { coreURL?: string; wasmURL?: string }) => Promise<void>;
  writeFile: (name: string, data: Uint8Array) => Promise<void>;
  readFile: (name: string) => Promise<Uint8Array>;
  deleteFile: (name: string) => Promise<void>;
  exec: (args: string[]) => Promise<void>;
};

let ffmpegInstance: FfmpegInstance | null = null;
let loadPromise: Promise<FfmpegInstance | null> | null = null;

function audioMime(format: AudioConvertFormat): string {
  return format === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
}

async function loadFfmpeg(): Promise<FfmpegInstance | null> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);
      const ffmpeg = new FFmpeg() as FfmpegInstance;
      const base = `${import.meta.env.BASE_URL}ffmpeg`;
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      ffmpegInstance = ffmpeg;
      void fetchFile;
      return ffmpeg;
    } catch {
      return null;
    }
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

export async function probeFfmpegWasmRuntime(): Promise<boolean> {
  const ff = await loadFfmpeg();
  return ff != null;
}

export async function convertAudioWithFfmpegWasm(
  bytes: ArrayBuffer,
  target: AudioConvertFormat,
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const ffmpeg = await loadFfmpeg();
  if (!ffmpeg) return null;

  const inputName = 'input.audio';
  const outputName = target === 'mp3' ? 'output.mp3' : 'output.m4a';
  const codec = target === 'mp3' ? 'libmp3lame' : 'aac';

  try {
    await ffmpeg.writeFile(inputName, new Uint8Array(bytes));
    await ffmpeg.exec([
      '-y',
      '-i',
      inputName,
      '-vn',
      '-acodec',
      codec,
      outputName,
    ]);
    const out = await ffmpeg.readFile(outputName);
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
    const copy = new Uint8Array(out);
    return { bytes: copy.buffer, mime: audioMime(target) };
  } catch {
    return null;
  }
}

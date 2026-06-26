/**
 * HttpTTS 流式播放（对标 Legado streamReadAloudAudio + ExoPlayer 边下边播）
 */

import { buildHttpTtsRequest } from '@/lib/media/text/http-tts-analyze';
import { fetchHttpTtsObjectUrl } from '@/lib/media/text/http-tts-speak';
import type { HttpTTS } from '@/types';

function pickAudioMime(contentType: string | undefined): string {
  const ct = (contentType ?? 'audio/mpeg').split(';')[0]?.trim().toLowerCase() ?? '';
  if (ct.startsWith('audio/')) return ct;
  return 'audio/mpeg';
}

function canUseMediaSource(mime: string): boolean {
  if (typeof MediaSource === 'undefined') return false;
  try {
    return MediaSource.isTypeSupported(mime);
  } catch {
    return false;
  }
}

async function playWithMediaSource(
  audioEl: HTMLAudioElement,
  response: Response,
  mime: string,
): Promise<string> {
  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  audioEl.src = objectUrl;

  await new Promise<void>((resolve, reject) => {
    const onOpen = () => resolve();
    const onError = () => reject(new Error('MediaSource 打开失败'));
    mediaSource.addEventListener('sourceopen', onOpen, { once: true });
    mediaSource.addEventListener('error', onError, { once: true });
  });

  const sourceBuffer = mediaSource.addSourceBuffer(mime);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('响应体不可流式读取');

  await new Promise<void>((resolve, reject) => {
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (mediaSource.readyState === 'open') {
              try {
                mediaSource.endOfStream();
              } catch {
                /* ignore */
              }
            }
            resolve();
            return;
          }
          await new Promise<void>((res, rej) => {
            const append = () => {
              try {
                sourceBuffer.appendBuffer(value);
                res();
              } catch (e) {
                rej(e);
              }
            };
            if (sourceBuffer.updating) {
              sourceBuffer.addEventListener('updateend', append, { once: true });
            } else {
              append();
            }
          });
        }
      } catch (e) {
        reject(e);
      }
    };
    void pump();
  });

  return objectUrl;
}

async function fetchHttpTtsResponse(
  httpTts: HttpTTS,
  speakText: string,
  speakSpeed: number,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const spec = buildHttpTtsRequest(httpTts, speakText, speakSpeed, extraHeaders);
  return fetch(spec.url, {
    method: spec.method,
    headers: spec.headers,
    body: spec.body,
  });
}

/**
 * 流式请求并播放 HttpTTS；返回 object URL（调用方 revoke）
 */
export async function playHttpTtsStream(
  httpTts: HttpTTS,
  speakText: string,
  speakSpeed: number,
  audioEl: HTMLAudioElement,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  if (typeof fetch === 'undefined') {
    return fetchHttpTtsObjectUrl(httpTts, speakText, speakSpeed, extraHeaders);
  }

  const spec = buildHttpTtsRequest(httpTts, speakText, speakSpeed, extraHeaders);
  const res = await fetchHttpTtsResponse(httpTts, speakText, speakSpeed, extraHeaders);
  if (!res.ok) {
    throw new Error(`HttpTTS 请求失败: ${res.status}`);
  }

  const mime = pickAudioMime(spec.contentType || res.headers.get('content-type') || undefined);
  if (res.body && canUseMediaSource(mime)) {
    try {
      return await playWithMediaSource(audioEl, res, mime);
    } catch {
      /* fallback */
    }
  }

  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);
  audioEl.src = url;
  return url;
}

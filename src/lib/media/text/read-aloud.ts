/**
 * 朗读（系统 TTS + HttpTTS，对齐 Legado ReadAloud）
 */

import { fetchHttpTtsObjectUrl } from '@/lib/media/text/http-tts-speak';
import { playHttpTtsStream } from '@/lib/media/text/http-tts-stream-play';
import { tts } from '@/lib/platform/tts';
import { ttsSpeechRateToSystemRate } from '@/lib/media/text/reader-ui-config';
import type { HttpTTS } from '@/types';
import {
  claimPlayback,
  registerPlaybackOwner,
  releasePlayback,
} from '@/lib/media/playback-exclusivity';

let speakGeneration = 0;

registerPlaybackOwner('readAloud', {
  pause: () => {
    pauseReadAloud();
  },
  resume: () => {
    resumeReadAloud();
  },
});

function isBenignSpeakError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('interrupted') || lower.includes('canceled');
}

let audioEl: HTMLAudioElement | null = null;
let audioObjectUrl: string | null = null;
let segmentResolve: (() => void) | null = null;
let segmentReject: ((err: Error) => void) | null = null;

export type ReadAloudEngine = 'system' | 'httpTts';
export type ReadAloudState = 'idle' | 'playing' | 'paused';

let state: ReadAloudState = 'idle';
let engine: ReadAloudEngine = 'system';

function revokeAudioUrl(): void {
  if (audioObjectUrl) {
    URL.revokeObjectURL(audioObjectUrl);
    audioObjectUrl = null;
  }
}

function settleSegment(): void {
  segmentResolve?.();
  segmentResolve = null;
  segmentReject = null;
}

function failSegment(message: string): void {
  const err = new Error(message);
  segmentReject?.(err);
  segmentResolve = null;
  segmentReject = null;
}

export function getReadAloudState(): ReadAloudState {
  syncState();
  return state;
}

export function getReadAloudEngine(): ReadAloudEngine {
  return engine;
}

function syncState(): void {
  if (engine === 'httpTts' && audioEl) {
    if (audioEl.paused && audioEl.currentTime > 0) state = 'paused';
    else if (!audioEl.paused) state = 'playing';
    else state = 'idle';
    return;
  }
  if (!isReadAloudSupported()) {
    state = 'idle';
    return;
  }
  if (tts.isPaused()) {
    state = 'paused';
  } else if (tts.isSpeaking()) {
    state = 'playing';
  } else {
    state = 'idle';
  }
}

export function isReadAloudSupported(): boolean {
  return tts.isSupported();
}

export function plainTextForAloud(htmlOrText: string): string {
  if (!htmlOrText) return '';
  const div = document.createElement('div');
  div.innerHTML = htmlOrText;
  return (div.textContent ?? div.innerText ?? '').replace(/\s+/g, ' ').trim();
}

export interface ReadAloudOptions {
  engine?: ReadAloudEngine;
  httpTts?: HttpTTS | null;
  speakSpeed?: number;
  ttsSpeechRate?: number;
  ttsFollowSys?: boolean;
  rate?: number;
  pitch?: number;
  lang?: string;
  voiceURI?: string;
  extraHeaders?: Record<string, string>;
  /** HttpTTS 预取音频 URL */
  preloadedAudioUrl?: string;
  /** HttpTTS 边下边播 */
  streamReadAloudAudio?: boolean;
  onBoundary?: (charIndex: number, charLength: number) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

function resolveSpeakSpeed(options: ReadAloudOptions): number {
  return options.ttsSpeechRate ?? options.speakSpeed ?? 5;
}

function resolveSystemRate(options: ReadAloudOptions): number | undefined {
  if (options.ttsFollowSys) return undefined;
  if (options.rate != null) return options.rate;
  return ttsSpeechRateToSystemRate(resolveSpeakSpeed(options));
}

async function playHttpSegment(
  httpTts: HttpTTS,
  plain: string,
  speakSpeed: number,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  return fetchHttpTtsObjectUrl(httpTts, plain, speakSpeed, extraHeaders);
}

/** 朗读选中片段（一次性，不进队列） */
export async function speakSelectionOnce(
  text: string,
  options: ReadAloudOptions = {},
): Promise<boolean> {
  return speakSegment(text, options);
}

export async function startReadAloud(
  text: string,
  options: ReadAloudOptions = {},
): Promise<boolean> {
  return speakSegment(text, options);
}

/** 朗读单段文本，段结束 resolve */
export function speakSegment(
  text: string,
  options: ReadAloudOptions = {},
): Promise<boolean> {
  const plain = plainTextForAloud(text);
  if (!plain) {
    options.onError?.('没有可朗读的内容');
    return Promise.resolve(false);
  }

  stopReadAloud();
  claimPlayback('readAloud');

  const useHttp = options.engine === 'httpTts' && options.httpTts?.url;
  const speakSpeed = resolveSpeakSpeed(options);
  const generation = speakGeneration + 1;
  speakGeneration = generation;

  if (useHttp && options.httpTts) {
    engine = 'httpTts';
    return new Promise<boolean>((resolve) => {
      void (async () => {
        try {
          audioEl = new Audio();
          if (options.preloadedAudioUrl) {
            audioObjectUrl = options.preloadedAudioUrl;
            audioEl.src = audioObjectUrl;
          } else if (options.streamReadAloudAudio) {
            audioObjectUrl = await playHttpTtsStream(
              options.httpTts!,
              plain,
              speakSpeed,
              audioEl,
              options.extraHeaders,
            );
          } else {
            audioObjectUrl = await playHttpSegment(
              options.httpTts!,
              plain,
              speakSpeed,
              options.extraHeaders,
            );
            audioEl.src = audioObjectUrl;
          }
          segmentResolve = () => {
            state = 'idle';
            options.onEnd?.();
            resolve(true);
          };
          segmentReject = (err) => {
            if (generation !== speakGeneration) return;
            state = 'idle';
            if (isBenignSpeakError(err.message)) {
              resolve(false);
              return;
            }
            options.onError?.(err.message);
            resolve(false);
          };
          audioEl.onended = () => settleSegment();
          audioEl.onerror = () => failSegment('HttpTTS 播放失败');
          await audioEl.play();
          state = 'playing';
        } catch (e) {
          state = 'idle';
          options.onError?.(
            e instanceof Error ? e.message : 'HttpTTS 请求失败',
          );
          resolve(false);
        }
      })();
    });
  }

  if (!isReadAloudSupported()) {
    options.onError?.('当前环境不支持语音朗读');
    return Promise.resolve(false);
  }

  engine = 'system';
  const rate = resolveSystemRate(options);

  return new Promise<boolean>((resolve) => {
    segmentResolve = () => {
      if (generation !== speakGeneration) return;
      state = 'idle';
      options.onEnd?.();
      resolve(true);
    };
    segmentReject = (err) => {
      if (generation !== speakGeneration) return;
      state = 'idle';
      if (isBenignSpeakError(err.message)) {
        resolve(false);
        return;
      }
      options.onError?.(err.message);
      resolve(false);
    };

    tts.setStateListener({
      onDone: () => settleSegment(),
      onError: (err) => {
        if (generation !== speakGeneration) return;
        if (isBenignSpeakError(err.message)) return;
        failSegment(err.message);
      },
    });

    void tts
      .speak(plain, {
        rate,
        pitch: options.pitch ?? 1,
        lang: options.lang ?? (options.voiceURI ? undefined : 'zh-CN'),
        voiceURI: options.voiceURI || undefined,
        onBoundary: (charIndex, charLength) => {
          options.onBoundary?.(charIndex, charLength);
        },
      })
      .then(() => {
        state = 'playing';
      })
      .catch((e) => {
        failSegment(e instanceof Error ? e.message : '朗读失败');
        resolve(false);
      });
  });
}

export function pauseReadAloud(): void {
  if (engine === 'httpTts' && audioEl) {
    audioEl.pause();
    syncState();
    return;
  }
  if (!isReadAloudSupported()) return;
  tts.pause();
  syncState();
}

export function resumeReadAloud(): void {
  if (engine === 'httpTts' && audioEl) {
    void audioEl.play();
    syncState();
    return;
  }
  if (!isReadAloudSupported()) return;
  tts.resume();
  syncState();
}

export function stopReadAloud(): void {
  speakGeneration += 1;
  if (audioEl) {
    audioEl.pause();
    audioEl.src = '';
    audioEl = null;
  }
  revokeAudioUrl();
  if (isReadAloudSupported()) {
    tts.stop();
    tts.removeStateListener();
  }
  segmentResolve = null;
  segmentReject = null;
  state = 'idle';
  engine = 'system';
  releasePlayback('readAloud');
}

export function toggleReadAloudPause(): void {
  syncState();
  if (state === 'playing') pauseReadAloud();
  else if (state === 'paused') resumeReadAloud();
}

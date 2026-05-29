/**
 * 朗读（系统 TTS + HttpTTS，对齐 Legado ReadAloud）
 */

import { fetchHttpTtsObjectUrl } from '@/lib/reader/http-tts-speak';
import type { HttpTTS } from '@/types';

let utterance: SpeechSynthesisUtterance | null = null;
let audioEl: HTMLAudioElement | null = null;
let audioObjectUrl: string | null = null;

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

export function getReadAloudState(): ReadAloudState {
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
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    state = 'idle';
    return;
  }
  if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
    state = 'paused';
  } else if (window.speechSynthesis.speaking) {
    state = 'playing';
  } else {
    state = 'idle';
  }
}

export function isReadAloudSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
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
  rate?: number;
  pitch?: number;
  lang?: string;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

export async function startReadAloud(
  text: string,
  options: ReadAloudOptions = {},
): Promise<boolean> {
  const plain = plainTextForAloud(text);
  if (!plain) {
    options.onError?.('没有可朗读的内容');
    return false;
  }
  stopReadAloud();

  const useHttp = options.engine === 'httpTts' && options.httpTts?.url;
  if (useHttp && options.httpTts) {
    try {
      engine = 'httpTts';
      audioObjectUrl = await fetchHttpTtsObjectUrl(
        options.httpTts,
        plain.slice(0, 2000),
        options.speakSpeed ?? 5,
      );
      audioEl = new Audio(audioObjectUrl);
      audioEl.onended = () => {
        state = 'idle';
        options.onEnd?.();
      };
      audioEl.onerror = () => {
        state = 'idle';
        options.onError?.('HttpTTS 播放失败');
      };
      await audioEl.play();
      state = 'playing';
      return true;
    } catch (e) {
      options.onError?.(
        e instanceof Error ? e.message : 'HttpTTS 请求失败',
      );
      return false;
    }
  }

  if (!isReadAloudSupported()) {
    options.onError?.('当前环境不支持语音朗读');
    return false;
  }
  engine = 'system';
  utterance = new SpeechSynthesisUtterance(plain);
  utterance.rate = options.rate ?? 1;
  utterance.pitch = options.pitch ?? 1;
  utterance.lang = options.lang ?? 'zh-CN';
  utterance.onend = () => {
    state = 'idle';
    options.onEnd?.();
  };
  utterance.onerror = () => {
    state = 'idle';
    options.onError?.('朗读失败');
  };
  window.speechSynthesis.speak(utterance);
  state = 'playing';
  return true;
}

export function pauseReadAloud(): void {
  if (engine === 'httpTts' && audioEl) {
    audioEl.pause();
    syncState();
    return;
  }
  if (!isReadAloudSupported()) return;
  window.speechSynthesis.pause();
  syncState();
}

export function resumeReadAloud(): void {
  if (engine === 'httpTts' && audioEl) {
    void audioEl.play();
    syncState();
    return;
  }
  if (!isReadAloudSupported()) return;
  window.speechSynthesis.resume();
  syncState();
}

export function stopReadAloud(): void {
  if (audioEl) {
    audioEl.pause();
    audioEl.src = '';
    audioEl = null;
  }
  revokeAudioUrl();
  if (isReadAloudSupported()) {
    window.speechSynthesis.cancel();
  }
  utterance = null;
  state = 'idle';
  engine = 'system';
}

export function toggleReadAloudPause(): void {
  syncState();
  if (state === 'playing') pauseReadAloud();
  else if (state === 'paused') resumeReadAloud();
}

/**
 * 朗读会话：段落队列、章切换、定时关闭（对齐 Legado BaseReadAloudService）
 */

import {
  getReadAloudState,
  pauseReadAloud,
  plainTextForAloud,
  resumeReadAloud,
  speakSegment,
  stopReadAloud,
  type ReadAloudEngine,
  type ReadAloudState,
} from '@/lib/media/text/read-aloud';
import { httpTtsConcurrentDelayMs } from '@/lib/media/text/http-tts-analyze';
import { loadHttpTtsLoginInfo } from '@/lib/media/text/http-tts-import';
import { fetchHttpTtsObjectUrl } from '@/lib/media/text/http-tts-speak';
import {
  splitChapterParagraphs,
  type ReadAloudParagraphAnchor,
} from '@/lib/media/text/read-aloud-paragraphs';
import {
  clearReadAloudProgress,
  computeChapterCharPosition,
  computeChapterPosFromParagraph,
  computeFineChapterPos,
  emitReadAloudProgress,
  type ReadAloudProgress,
} from '@/lib/media/text/read-aloud-progress';
import {
  bindReadAloudFocusResume,
  unbindReadAloudFocusResume,
} from '@/lib/media/text/read-aloud-focus-resume';
import {
  bindReadAloudMediaSession,
  clearReadAloudMediaSession,
  updateReadAloudMediaSession,
  type ReadAloudMediaMetadata,
} from '@/lib/media/text/read-aloud-media-session';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import type { HttpTTS } from '@/types';
import { globalMediaPlayerStore } from '@/stores/global-media-player';

export type ReadAloudReadingAnchor = ReadAloudParagraphAnchor & {
  chapterIndex: number;
};

export type ReadAloudSessionContext = {
  getChapterContent: () => string;
  getChapterIndex: () => number;
  getReadingAnchor: () => ReadAloudReadingAnchor;
  onRequestPrevChapter: () => Promise<void>;
  onRequestNextChapter: () => Promise<void>;
  onChapterFinished: () => Promise<boolean>;
  getConfig: () => TextViewerUiConfig;
  resolveHttpTts: (id: number | null) => Promise<HttpTTS | null>;
  getMediaMetadata?: () => ReadAloudMediaMetadata;
  onAutoPagerStop?: () => void;
  onError?: (message: string) => void;
  /** 边界提示等轻量通知（非错误） */
  onNotify?: (message: string) => void;
  getChapterCount: () => number;
  onStateChange?: (snapshot: ReadAloudSessionSnapshot) => void;
  onProgress?: (progress: ReadAloudProgress) => void;
};

export type ReadAloudSessionSnapshot = {
  state: ReadAloudState;
  paragraphIndex: number;
  paragraphCount: number;
  chapterIndex: number;
  timerMinutes: number;
  currentParagraphPreview: string;
  progress: ReadAloudProgress | null;
};

type SessionListener = (snapshot: ReadAloudSessionSnapshot) => void;

let ctx: ReadAloudSessionContext | null = null;
let paragraphs: string[] = [];
let paragraphIndex = 0;
let chapterIndex = 0;
let timerMinutes = 0;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let playing = false;
let userPausedManual = false;
let lastHttpRequestAt = 0;
const prefetchCache = new Map<number, string>();
const listeners = new Set<SessionListener>();

function revokePrefetchCache(): void {
  for (const url of prefetchCache.values()) {
    URL.revokeObjectURL(url);
  }
  prefetchCache.clear();
}

function emitProgressForCurrentParagraph(charIndex = 0): void {
  if (!ctx || paragraphs.length === 0) return;
  const text = paragraphs[paragraphIndex] ?? '';
  const plainLen = plainTextForAloud(text).length;
  const safeCharIndex = Math.min(Math.max(0, charIndex), plainLen);
  const progress: ReadAloudProgress = {
    chapterIndex,
    paragraphIndex,
    paragraphCount: paragraphs.length,
    paragraphText: text,
    chapterPos: computeChapterPosFromParagraph(paragraphIndex, paragraphs.length),
    chapterCharPosition: computeChapterCharPosition(paragraphs, paragraphIndex, safeCharIndex),
    paragraphCharIndex: safeCharIndex,
  };
  emitReadAloudProgress(progress);
  ctx.onProgress?.(progress);
  notify();
  const meta = ctx.getMediaMetadata?.();
  if (meta) {
    updateReadAloudMediaSession({
      ...meta,
      paragraphPreview: progress.paragraphText.slice(0, 80),
    });
  }
}

function resolveSessionPlaybackState(): ReadAloudState {
  const engineState = getReadAloudState();
  if (!playing) return engineState;
  if (userPausedManual || engineState === 'paused') return 'paused';
  return 'playing';
}

function notify(): void {
  const snapshot = getReadAloudSessionSnapshot();
  for (const fn of listeners) fn(snapshot);
  ctx?.onStateChange?.(snapshot);
}

export function getReadAloudSessionSnapshot(): ReadAloudSessionSnapshot {
  const playbackState = resolveSessionPlaybackState();
  const paragraphText = paragraphs[paragraphIndex] ?? '';
  return {
    state: playbackState,
    paragraphIndex,
    paragraphCount: paragraphs.length,
    chapterIndex,
    timerMinutes,
    currentParagraphPreview: paragraphText,
    progress: paragraphIndex >= 0 && paragraphs.length > 0
      ? {
          chapterIndex,
          paragraphIndex,
          paragraphCount: paragraphs.length,
          paragraphText,
          chapterPos: computeChapterPosFromParagraph(paragraphIndex, paragraphs.length),
          chapterCharPosition: computeChapterCharPosition(paragraphs, paragraphIndex, 0),
          paragraphCharIndex: 0,
        }
      : null,
  };
}

export function subscribeReadAloudSession(listener: SessionListener): () => void {
  listeners.add(listener);
  listener(getReadAloudSessionSnapshot());
  return () => listeners.delete(listener);
}

function clearTimer(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimerTick(): void {
  clearTimer();
  if (timerMinutes <= 0) return;
  timerInterval = setInterval(() => {
    if (timerMinutes <= 0) {
      clearTimer();
      return;
    }
    timerMinutes -= 1;
    notify();
    if (timerMinutes <= 0) {
      void stopReadAloudSession();
    }
  }, 60_000);
}

export function setReadAloudTimer(minutes: number): void {
  timerMinutes = Math.max(0, Math.min(180, Math.round(minutes)));
  startTimerTick();
  notify();
}

function buildReadOptions(httpTts: HttpTTS | null) {
  const cfg = ctx!.getConfig();
  const extraHeaders: Record<string, string> = {};
  if (httpTts && cfg.httpTtsId != null) {
    const login = loadHttpTtsLoginInfo(cfg.httpTtsId);
    if (login) {
      try {
        extraHeaders['X-Login-Info'] = JSON.stringify(login);
      } catch {
        /* ignore */
      }
    }
  }
  return {
    engine: cfg.aloudEngine as ReadAloudEngine,
    httpTts,
    speakSpeed: cfg.ttsSpeechRate ?? cfg.speakSpeed,
    ttsSpeechRate: cfg.ttsSpeechRate ?? cfg.speakSpeed,
    ttsFollowSys: cfg.ttsFollowSys,
    lang: cfg.systemTtsLang || 'zh-CN',
    voiceURI: cfg.systemTtsVoiceURI || undefined,
    extraHeaders,
    streamReadAloudAudio: cfg.streamReadAloudAudio ?? false,
  };
}

async function throttleHttp(httpTts: HttpTTS | null): Promise<void> {
  if (!httpTts) return;
  const delay = httpTtsConcurrentDelayMs(httpTts);
  if (delay <= 0) return;
  const now = Date.now();
  const elapsed = now - lastHttpRequestAt;
  if (elapsed < delay) {
    await new Promise((r) => setTimeout(r, delay - elapsed));
  }
  lastHttpRequestAt = Date.now();
}

async function prefetchParagraph(index: number): Promise<void> {
  if (!ctx || index < 0 || index >= paragraphs.length) return;
  if (prefetchCache.has(index)) return;
  const cfg = ctx.getConfig();
  if (cfg.aloudEngine !== 'httpTts' || cfg.httpTtsId == null) return;
  const httpTts = await ctx.resolveHttpTts(cfg.httpTtsId);
  if (!httpTts) return;
  try {
    await throttleHttp(httpTts);
    const opts = buildReadOptions(httpTts);
    const url = await fetchHttpTtsObjectUrl(
      httpTts,
      paragraphs[index],
      opts.speakSpeed,
      opts.extraHeaders,
    );
    prefetchCache.set(index, url);
  } catch {
    /* prefetch failure is non-fatal */
  }
}

function takePrefetch(index: number): string | undefined {
  const url = prefetchCache.get(index);
  if (url) prefetchCache.delete(index);
  return url;
}

async function loadQueueFromCurrentChapter(
  startAtAnchor = true,
  startParagraphIndex?: number,
): Promise<boolean> {
  if (!ctx) return false;
  const content = ctx.getChapterContent();
  const cfg = ctx.getConfig();
  const anchor = startAtAnchor ? ctx.getReadingAnchor() : { chapterIndex: chapterIndex };
  const split = splitChapterParagraphs(content, {
    readAloudByPage: cfg.readAloudByPage,
    anchor: {
      chapterPos: anchor.chapterPos,
      pageText: anchor.pageText,
    },
    startParagraphIndex,
  });
  paragraphs = split.paragraphs;
  paragraphIndex = startParagraphIndex ?? (startAtAnchor ? split.startIndex : 0);
  chapterIndex = ctx.getChapterIndex();
  revokePrefetchCache();
  notify();
  return paragraphs.length > 0;
}

async function playCurrentParagraph(): Promise<void> {
  if (!ctx || !playing || userPausedManual) return;
  if (paragraphIndex < 0 || paragraphIndex >= paragraphs.length) {
    const advanced = await ctx.onChapterFinished();
    if (!advanced) {
      playing = false;
      stopReadAloud();
      clearReadAloudProgress();
      notify();
      return;
    }
    chapterIndex = ctx.getChapterIndex();
    const ok = await loadQueueFromCurrentChapter(false);
    if (!ok || !playing) {
      playing = false;
      notify();
      return;
    }
    await playCurrentParagraph();
    return;
  }

  const cfg = ctx.getConfig();
  const httpTts =
    cfg.aloudEngine === 'httpTts' && cfg.httpTtsId != null
      ? await ctx.resolveHttpTts(cfg.httpTtsId)
      : null;

  if (cfg.aloudEngine === 'httpTts' && !httpTts) {
    ctx.onError?.('未配置 HttpTTS 引擎');
    playing = false;
    stopReadAloud();
    notify();
    return;
  }

  emitProgressForCurrentParagraph();
  void prefetchParagraph(paragraphIndex + 1);

  const text = paragraphs[paragraphIndex];
  const preloaded = takePrefetch(paragraphIndex);

  if (!preloaded) {
    await throttleHttp(httpTts);
  }

  const ok = await speakSegment(text, {
    ...buildReadOptions(httpTts),
    preloadedAudioUrl: preloaded,
    onBoundary:
      cfg.aloudEngine === 'httpTts'
        ? undefined
        : (charIndex) => {
            if (!ctx || !playing) return;
            const finePos = computeFineChapterPos(
              paragraphIndex,
              paragraphs.length,
              charIndex,
              text,
            );
            const progress: ReadAloudProgress = {
              chapterIndex,
              paragraphIndex,
              paragraphCount: paragraphs.length,
              paragraphText: text,
              chapterPos: finePos,
              chapterCharPosition: computeChapterCharPosition(
                paragraphs,
                paragraphIndex,
                charIndex,
              ),
              paragraphCharIndex: charIndex,
            };
            emitReadAloudProgress(progress);
            ctx.onProgress?.(progress);
            notify();
          },
    onEnd: () => {
      if (!playing || userPausedManual) return;
      const finishedLen = plainTextForAloud(paragraphs[paragraphIndex] ?? '').length;
      emitProgressForCurrentParagraph(finishedLen);
      paragraphIndex += 1;
      void playCurrentParagraph();
    },
    onError: (msg) => {
      if (msg.toLowerCase().includes('interrupted') || msg.toLowerCase().includes('canceled')) {
        return;
      }
      playing = false;
      ctx?.onError?.(msg);
      stopReadAloud();
      notify();
    },
  });

  if (!ok) {
    playing = false;
    notify();
    return;
  }

  if (userPausedManual) {
    notify();
    return;
  }
}

export async function startReadAloudSession(
  context: ReadAloudSessionContext,
  options?: { startParagraphIndex?: number },
): Promise<boolean> {
  ctx = context;
  userPausedManual = false;
  bindReadAloudMediaSession({ getConfig: () => context.getConfig() });
  bindReadAloudFocusResume({
    getResumeOnFocus: () => context.getConfig().readAloudResumeOnFocus ?? false,
  });
  playing = true;
  context.onAutoPagerStop?.();
  const cfg = context.getConfig();
  setReadAloudTimer(cfg.ttsTimer ?? 0);

  const ok = await loadQueueFromCurrentChapter(
    options?.startParagraphIndex == null,
    options?.startParagraphIndex,
  );
  if (!ok) {
    context.onError?.('没有可朗读的内容');
    playing = false;
    notify();
    return false;
  }

  await playCurrentParagraph();
  notify();
  return true;
}

export async function startReadAloudSessionFromSelection(
  context: ReadAloudSessionContext,
  startParagraphIndex: number,
): Promise<boolean> {
  return startReadAloudSession(context, { startParagraphIndex });
}

export function pauseReadAloudSession(): void {
  userPausedManual = true;
  pauseReadAloud();
  notify();
}

export function resumeReadAloudSession(): void {
  userPausedManual = false;
  const st = getReadAloudState();
  if (st === 'paused') {
    resumeReadAloud();
  } else if (st === 'idle' && playing) {
    void playCurrentParagraph();
  }
  notify();
}

export function isReadAloudUserPaused(): boolean {
  return userPausedManual;
}

export function stopReadAloudSession(): void {
  const wasShellBackground = globalMediaPlayerStore.isReadAloudShellActive();
  playing = false;
  userPausedManual = false;
  stopReadAloud();
  revokePrefetchCache();
  clearTimer();
  clearReadAloudProgress();
  clearReadAloudMediaSession();
  unbindReadAloudFocusResume();
  notify();
  if (wasShellBackground) {
    globalMediaPlayerStore.deactivate();
    void import('@/lib/media/text/read-aloud-background').then((m) => {
      void m.cleanupReadAloudBackgroundBook();
    });
  }
}

export function toggleReadAloudSessionPlay(): void {
  if (playing) {
    if (userPausedManual || getReadAloudState() === 'paused') {
      resumeReadAloudSession();
    } else {
      pauseReadAloudSession();
    }
    return;
  }
  if (ctx) {
    void startReadAloudSession(ctx);
  }
}

function notifyUser(message: string): void {
  ctx?.onNotify?.(message);
}

export async function prevReadAloudParagraph(): Promise<void> {
  if (!ctx) return;
  const cfg = ctx.getConfig();
  if (cfg.mediaButtonPerNext) {
    await prevReadAloudChapter();
    return;
  }
  if (paragraphIndex > 0) {
    stopReadAloud();
    paragraphIndex -= 1;
    playing = true;
    notify();
    await playCurrentParagraph();
    return;
  }
  const chapterIdx = ctx.getChapterIndex();
  if (chapterIdx <= 0) {
    notifyUser('已位于首章首段');
    return;
  }
  stopReadAloud();
  const before = chapterIdx;
  await ctx.onRequestPrevChapter();
  if (ctx.getChapterIndex() >= before) return;
  chapterIndex = ctx.getChapterIndex();
  playing = true;
  await loadQueueFromCurrentChapter(false);
  paragraphIndex = Math.max(0, paragraphs.length - 1);
  notify();
  await playCurrentParagraph();
}

export async function nextReadAloudParagraph(): Promise<void> {
  if (!ctx) return;
  const cfg = ctx.getConfig();
  if (cfg.mediaButtonPerNext) {
    await nextReadAloudChapter();
    return;
  }
  if (paragraphIndex < paragraphs.length - 1) {
    stopReadAloud();
    paragraphIndex += 1;
    playing = true;
    notify();
    await playCurrentParagraph();
    return;
  }
  const chapterIdx = ctx.getChapterIndex();
  const chapterCount = ctx.getChapterCount();
  if (chapterCount > 0 && chapterIdx >= chapterCount - 1) {
    notifyUser('已位于最后一章最后一段');
    return;
  }
  stopReadAloud();
  const before = chapterIdx;
  await ctx.onRequestNextChapter();
  if (ctx.getChapterIndex() <= before) return;
  chapterIndex = ctx.getChapterIndex();
  playing = true;
  await loadQueueFromCurrentChapter(false);
  paragraphIndex = 0;
  notify();
  await playCurrentParagraph();
}

export async function prevReadAloudChapter(): Promise<void> {
  if (!ctx) return;
  if (ctx.getChapterIndex() <= 0) {
    notifyUser('已位于第一章');
    return;
  }
  stopReadAloud();
  await ctx.onRequestPrevChapter();
  chapterIndex = ctx.getChapterIndex();
  playing = true;
  await loadQueueFromCurrentChapter(false);
  paragraphIndex = 0;
  notify();
  await playCurrentParagraph();
}

export async function nextReadAloudChapter(): Promise<void> {
  if (!ctx) return;
  const chapterCount = ctx.getChapterCount();
  if (chapterCount > 0 && ctx.getChapterIndex() >= chapterCount - 1) {
    notifyUser('已位于最后一章');
    return;
  }
  stopReadAloud();
  await ctx.onRequestNextChapter();
  chapterIndex = ctx.getChapterIndex();
  playing = true;
  await loadQueueFromCurrentChapter(false);
  paragraphIndex = 0;
  notify();
  await playCurrentParagraph();
}

export function bindReadAloudSessionContext(context: ReadAloudSessionContext): void {
  ctx = context;
  bindReadAloudMediaSession({ getConfig: () => context.getConfig() });
}

export function unbindReadAloudSessionContext(): void {
  if (globalMediaPlayerStore.isReadAloudShellActive()) {
    return;
  }
  stopReadAloudSession();
  ctx = null;
  paragraphs = [];
  paragraphIndex = 0;
}

export function isReadAloudSessionPlaying(): boolean {
  return playing;
}

export function isReadAloudSessionActive(): boolean {
  const st = getReadAloudState();
  return playing || st === 'playing' || st === 'paused';
}

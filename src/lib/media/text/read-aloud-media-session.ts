/**
 * Media Session API（对标 Legado MediaSession 子集）
 */

import {
  getReadAloudState,
  type ReadAloudState,
} from '@/lib/media/text/read-aloud';
import {
  nextReadAloudChapter,
  nextReadAloudParagraph,
  pauseReadAloudSession,
  prevReadAloudChapter,
  prevReadAloudParagraph,
  resumeReadAloudSession,
} from '@/lib/media/text/read-aloud-session';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

export type ReadAloudMediaMetadata = {
  bookName?: string;
  chapterTitle?: string;
  paragraphPreview?: string;
};

let bound = false;
let getConfig: (() => TextViewerUiConfig) | null = null;

function playbackStateFromReadAloud(st: ReadAloudState): MediaSessionPlaybackState {
  if (st === 'playing') return 'playing';
  if (st === 'paused') return 'paused';
  return 'none';
}

function syncPlaybackState(): void {
  if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
  navigator.mediaSession.playbackState = playbackStateFromReadAloud(getReadAloudState());
}

async function handlePrev(): Promise<void> {
  const cfg = getConfig?.();
  if (cfg?.mediaButtonPerNext) await prevReadAloudChapter();
  else await prevReadAloudParagraph();
}

async function handleNext(): Promise<void> {
  const cfg = getConfig?.();
  if (cfg?.mediaButtonPerNext) await nextReadAloudChapter();
  else await nextReadAloudParagraph();
}

export function bindReadAloudMediaSession(options: {
  getConfig: () => TextViewerUiConfig;
}): void {
  if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
  getConfig = options.getConfig;
  if (bound) return;
  bound = true;

  try {
    navigator.mediaSession.setActionHandler('play', () => {
      resumeReadAloudSession();
      syncPlaybackState();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      pauseReadAloudSession();
      syncPlaybackState();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      void handlePrev();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      void handleNext();
    });
  } catch {
    /* unsupported action */
  }
}

export function updateReadAloudMediaSession(meta: ReadAloudMediaMetadata): void {
  if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.paragraphPreview || meta.chapterTitle || '朗读中',
      artist: meta.bookName || '',
      album: meta.chapterTitle || '',
    });
  } catch {
    /* ignore */
  }
  syncPlaybackState();
}

export function clearReadAloudMediaSession(): void {
  if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
    navigator.mediaSession.setActionHandler('previoustrack', null);
    navigator.mediaSession.setActionHandler('nexttrack', null);
  } catch {
    /* ignore */
  }
  bound = false;
  getConfig = null;
}

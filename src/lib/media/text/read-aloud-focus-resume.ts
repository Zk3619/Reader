/**
 * 朗读焦点恢复（页面重新可见时自动 resume，对标 Legado 音频焦点恢复）
 */

import { getReadAloudState } from '@/lib/media/text/read-aloud';
import {
  isReadAloudUserPaused,
  resumeReadAloudSession,
} from '@/lib/media/text/read-aloud-session';

let bound = false;
let wasPlayingBeforeHide = false;
let getResumeOnFocus: (() => boolean) | null = null;

function onVisibilityChange(): void {
  if (typeof document === 'undefined') return;
  if (!getResumeOnFocus?.()) return;

  if (document.visibilityState === 'hidden') {
    wasPlayingBeforeHide = getReadAloudState() === 'playing';
    return;
  }

  if (
    document.visibilityState === 'visible' &&
    wasPlayingBeforeHide &&
    getReadAloudState() === 'paused' &&
    !isReadAloudUserPaused()
  ) {
    resumeReadAloudSession();
  }
  wasPlayingBeforeHide = false;
}

export function bindReadAloudFocusResume(options: {
  getResumeOnFocus: () => boolean;
}): void {
  if (typeof document === 'undefined') return;
  getResumeOnFocus = options.getResumeOnFocus;
  if (bound) return;
  bound = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
}

export function unbindReadAloudFocusResume(): void {
  if (typeof document === 'undefined' || !bound) return;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  bound = false;
  getResumeOnFocus = null;
  wasPlayingBeforeHide = false;
}

/**
 * 进入后台朗读：保持会话，退出阅读器并在主壳层显示全局播放器（对标 Legado to_backstage）
 */

import { requestCloseViewerShellOverlays } from '@/lib/ui/overlay-cleanup';
import {
  isReadAloudSessionActive,
  startReadAloudSession,
  type ReadAloudSessionContext,
} from '@/lib/media/text/read-aloud-session';
import {
  globalMediaPlayerStore,
  type GlobalMediaPlayerMeta,
} from '@/stores/global-media-player';

let backgroundExitInProgress = false;

/** 后台退出阅读器期间：禁止顶底栏指针逻辑触发 DOM 更新 */
export function isReadAloudBackgroundExitInProgress(): boolean {
  return backgroundExitInProgress;
}

export function clearReadAloudBackgroundExitFlag(): void {
  backgroundExitInProgress = false;
}

export function enterReadAloudBackground(
  sessionContext: ReadAloudSessionContext,
  exitReader: () => void,
  meta: GlobalMediaPlayerMeta,
  bookUrl: string,
): void {
  if (!isReadAloudSessionActive()) {
    void startReadAloudSession(sessionContext);
  }
  backgroundExitInProgress = true;
  globalMediaPlayerStore.activateReadAloud(meta, bookUrl);
  requestCloseViewerShellOverlays();
  exitReader();
}

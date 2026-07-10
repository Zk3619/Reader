/**
 * Viewer 生命周期辅助（从 App.tsx 渐进抽出）
 */

import type { Book, BookChapter } from '@/types';
import { revokeAudioPlaybackUrls } from '@/stores/viewer/media/audio';
import { globalMediaPlayerStore } from '@/stores/global-media-player';
import { isAudioHubBookUrl, openAudioHubShell } from '@/app/open-content';

export interface OpenReaderPageContext {
  openReaderPage: (book: Book, catalog?: BookChapter[], source?: unknown) => void;
}

/** music hub 关闭时清理播放资源 */
export function cleanupMusicHubOnClose(): void {
  revokeAudioPlaybackUrls();
  globalMediaPlayerStore.deactivate();
}

/** 是否应在返回时关闭 music hub（无 book 且 music 模式） */
export function shouldTreatAsMusicHubSession(
  playbackMode: string,
  book: Book | null,
): boolean {
  return playbackMode === 'music' && !book;
}

/** 壳层播放器返回音乐中心（媒体页音乐 Tab） */
export function openMusicHubFromShell(
  openMusicHub: (options?: { panel?: 'search' | 'library' | 'playlist' | 'sync' }) => Promise<void>,
): void {
  void openAudioHubShell(openMusicHub);
}

/** finishCloseReader 中 music hub 分支判断 */
export function isMusicHubNavEntry(
  kind: string,
  bookUrl?: string,
): boolean {
  return kind === 'audio-viewer' && isAudioHubBookUrl(bookUrl ?? '');
}

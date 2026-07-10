/**
 * 打开音乐中心（迁入媒体页 shell，不再 push audio-viewer overlay）
 */

import { navigateToMusicHub, type NavigateMusicHubOptions } from '@/stores/shell-tabs';
import { setMusicSection } from '@/stores/viewer/media/audio';
import type { MusicHubSection } from '@/stores/viewer/base-state';

export type OpenAudioHubOptions = NavigateMusicHubOptions & {
  /** 预填搜索关键词（需配合 panel: 'search'） */
  searchKeyword?: string;
};

export type OpenAudioHubContext = {
  navigateShell: (page: 'bookshelf') => void;
  openMusicHub: (options?: { panel?: OpenAudioHubOptions['panel']; section?: MusicHubSection }) => Promise<void>;
};

export function isAudioHubBookUrl(url: string): boolean {
  return url === 'audio-hub://music' || url === 'shell-music-hub';
}

/** @deprecated overlay 路径已废弃，统一跳转媒体页音乐 Tab */
export async function openAudioHubViewer(
  _nav: unknown,
  openMusicHub: OpenAudioHubContext['openMusicHub'],
  options?: OpenAudioHubOptions,
): Promise<void> {
  await openAudioHubShell(openMusicHub, options);
}

export async function openAudioHubShell(
  openMusicHub: OpenAudioHubContext['openMusicHub'],
  options?: OpenAudioHubOptions,
): Promise<void> {
  const { section } = navigateToMusicHub(options);
  await openMusicHub({ section, panel: options?.panel });
  if (options?.searchKeyword?.trim()) {
    setMusicSection('search');
  }
}

export async function openAudioHubWithSearch(
  openMusicHub: OpenAudioHubContext['openMusicHub'],
  keyword = '',
): Promise<void> {
  await openAudioHubShell(openMusicHub, { panel: 'search' });
  void keyword;
}

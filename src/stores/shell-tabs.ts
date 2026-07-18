/**
 * 媒体页 / 来源页顶栏 Tab 状态（Shell 层，非 overlay）
 * 读写经统一持久化域 shell.tabs；localStorage 作同步镜像。
 */

import { createSignal } from 'solid-js';
import { BookSourceType } from '@/lib/book-source/book-type';
import type { MusicHubSection } from '@/stores/viewer/base-state';
import { getCachedMusicHubSection } from '@/lib/persistence/domains/music-session';
import { setMusicSection } from '@/stores/viewer/media/audio';
import {
  bindShellTabsPersistAppliers,
  persistShellTabsSnapshot,
  SHELL_TABS_VERSION,
  type AudioMediaSubTab,
  type AudioSourceSubTab,
  type MediaKindTab,
  type ShellTabsSnapshot,
  type SourceTypeTab,
} from '@/lib/persistence/domains/shell-tabs';

export type { AudioMediaSubTab, AudioSourceSubTab, MediaKindTab, SourceTypeTab };

const MEDIA_TAB_KEY = 'mediabox_media_kind_tab';
const AUDIO_MEDIA_SUB_KEY = 'mediabox_audio_media_sub_tab';
const SOURCE_TAB_KEY = 'mediabox_source_type_tab';
const AUDIO_SOURCE_SUB_KEY = 'mediabox_audio_source_sub_tab';

function readStored<T extends string>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return raw as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readStoredMediaTab(): MediaKindTab {
  const raw = readStored<string>(MEDIA_TAB_KEY, 'text');
  if (raw === 'file') return 'text';
  return raw as MediaKindTab;
}

const [mediaKindTab, setMediaKindTabSignal] = createSignal<MediaKindTab>(
  readStoredMediaTab(),
);
const [audioMediaSubTab, setAudioMediaSubTabSignal] = createSignal<AudioMediaSubTab>(
  readStored<AudioMediaSubTab>(AUDIO_MEDIA_SUB_KEY, 'audiobook'),
);
const [sourceTypeTab, setSourceTypeTabSignal] = createSignal<SourceTypeTab>(
  readStored<SourceTypeTab>(SOURCE_TAB_KEY, 'text'),
);
const [audioSourceSubTab, setAudioSourceSubTabSignal] = createSignal<AudioSourceSubTab>(
  readStored<AudioSourceSubTab>(AUDIO_SOURCE_SUB_KEY, 'audiobook'),
);

function captureShellTabs(): ShellTabsSnapshot {
  return {
    version: SHELL_TABS_VERSION,
    mediaKindTab: mediaKindTab(),
    audioMediaSubTab: audioMediaSubTab(),
    sourceTypeTab: sourceTypeTab(),
    audioSourceSubTab: audioSourceSubTab(),
  };
}

function applyShellTabs(snap: ShellTabsSnapshot): void {
  setMediaKindTabSignal(
    snap.mediaKindTab === ('file' as MediaKindTab) ? 'text' : snap.mediaKindTab,
  );
  setAudioMediaSubTabSignal(snap.audioMediaSubTab);
  setSourceTypeTabSignal(snap.sourceTypeTab);
  setAudioSourceSubTabSignal(snap.audioSourceSubTab);
}

bindShellTabsPersistAppliers({
  apply: applyShellTabs,
  capture: captureShellTabs,
});

function scheduleShellTabsPersist(): void {
  void persistShellTabsSnapshot(captureShellTabs());
}

export function setMediaKindTab(tab: MediaKindTab): void {
  setMediaKindTabSignal(tab);
  writeStored(MEDIA_TAB_KEY, tab);
  scheduleShellTabsPersist();
}

export function setAudioMediaSubTab(tab: AudioMediaSubTab): void {
  setAudioMediaSubTabSignal(tab);
  writeStored(AUDIO_MEDIA_SUB_KEY, tab);
  scheduleShellTabsPersist();
}

export function setSourceTypeTab(tab: SourceTypeTab): void {
  setSourceTypeTabSignal(tab);
  writeStored(SOURCE_TAB_KEY, tab);
  scheduleShellTabsPersist();
}

export function setAudioSourceSubTab(tab: AudioSourceSubTab): void {
  setAudioSourceSubTabSignal(tab);
  writeStored(AUDIO_SOURCE_SUB_KEY, tab);
  scheduleShellTabsPersist();
}

export function mediaKindTabValue(): MediaKindTab {
  return mediaKindTab();
}

export function audioMediaSubTabValue(): AudioMediaSubTab {
  return audioMediaSubTab();
}

export function sourceTypeTabValue(): SourceTypeTab {
  return sourceTypeTab();
}

export function audioSourceSubTabValue(): AudioSourceSubTab {
  return audioSourceSubTab();
}

/** 来源页 Tab → bookSourceType 枚举 */
export function sourceTypeTabToBookSourceType(tab: SourceTypeTab): number {
  switch (tab) {
    case 'image':
      return BookSourceType.image;
    case 'audio':
      return BookSourceType.audio;
    case 'video':
      return BookSourceType.video;
    case 'file':
      return BookSourceType.file;
    default:
      return BookSourceType.text;
  }
}

export type NavigateMusicHubOptions = {
  panel?: 'search' | 'library' | 'playlist' | 'sync';
  section?: MusicHubSection;
};

/** 打开音乐壳 Tab 并可选聚焦 section */
export function navigateToMusicHub(options?: NavigateMusicHubOptions): {
  section: MusicHubSection;
} {
  const section = panelToSection(options?.panel, options?.section);
  setMusicSection(section);
  return { section };
}

function panelToSection(
  panel?: NavigateMusicHubOptions['panel'],
  section?: MusicHubSection,
): MusicHubSection {
  if (section) return section;
  switch (panel) {
    case 'search':
      return 'search';
    case 'library':
    case 'playlist':
      return 'list';
    case 'sync':
      return 'settings';
    default:
      return getCachedMusicHubSection();
  }
}

/** 是否处于音乐 Hub（独立 music 壳页，或旧版 media 页 audio/music 子 Tab） */
export function isMusicHubShellActive(currentShellPage?: string): boolean {
  if (currentShellPage === 'music') return true;
  if (currentShellPage != null && currentShellPage !== 'media') return false;
  return mediaKindTab() === 'audio' && audioMediaSubTab() === 'music';
}

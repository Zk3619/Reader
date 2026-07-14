/**
 * 媒体页 / 来源页顶栏 Tab 状态（Shell 层，非 overlay）
 */

import { createSignal } from 'solid-js';
import type { MediaKind } from '@/lib/book-source/book-type';
import { BookSourceType } from '@/lib/book-source/book-type';
import type { MusicHubSection } from '@/stores/viewer/base-state';
import { setMusicSection } from '@/stores/viewer/media/audio';

export type MediaKindTab = MediaKind;

export type AudioMediaSubTab = 'audiobook' | 'music';

export type SourceTypeTab = 'text' | 'image' | 'audio' | 'video' | 'file';

export type AudioSourceSubTab = 'audiobook' | 'music';

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

export function setMediaKindTab(tab: MediaKindTab): void {
  setMediaKindTabSignal(tab);
  writeStored(MEDIA_TAB_KEY, tab);
}

export function setAudioMediaSubTab(tab: AudioMediaSubTab): void {
  setAudioMediaSubTabSignal(tab);
  writeStored(AUDIO_MEDIA_SUB_KEY, tab);
}

export function setSourceTypeTab(tab: SourceTypeTab): void {
  setSourceTypeTabSignal(tab);
  writeStored(SOURCE_TAB_KEY, tab);
}

export function setAudioSourceSubTab(tab: AudioSourceSubTab): void {
  setAudioSourceSubTabSignal(tab);
  writeStored(AUDIO_SOURCE_SUB_KEY, tab);
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
      return 'search';
  }
}

/** 是否处于音乐 Hub（独立 music 壳页，或旧版 media 页 audio/music 子 Tab） */
export function isMusicHubShellActive(currentShellPage?: string): boolean {
  if (currentShellPage === 'music') return true;
  // 旧路径：音乐 Hub 挂在 media 页；传入其它壳页时明确为否
  if (currentShellPage != null && currentShellPage !== 'media') return false;
  return mediaKindTab() === 'audio' && audioMediaSubTab() === 'music';
}

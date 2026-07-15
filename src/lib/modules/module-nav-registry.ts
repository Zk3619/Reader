/**
 * 壳模块内子页导航注册表（顶栏 / 融合侧栏 / 独立侧栏共用）
 */

import type { Component } from 'solid-js';
import { Search, ListMusic, Library, Trophy, Settings2 } from 'lucide-solid';
import type { PageType } from '@/components/shell/Navigation';
import {
  BookshelfIcon,
  BookSearchIcon,
  BookSourceIcon,
  BookmarkIcon,
  RecordIcon,
  RssTabIcon,
  GroupVideoIcon,
} from '@/components/shared/icons';
import type { ReaderInternalTab } from '@/stores/reader-internal-tab';
import { readerInternalTabValue, setReaderInternalTab } from '@/stores/reader-internal-tab';
import type { MusicHubSection } from '@/stores/viewer/base-state';
import { state } from '@/stores/viewer/media/state';
import { setMusicSection } from '@/stores/viewer/media/audio';
import { normalizePageType } from '@/lib/media-shelf/compat-keys';

export type ModuleNavItem = {
  id: string;
  label: string;
  description?: string;
  icon?: Component<{ class?: string; size?: number }>;
};

const READER_NAV: ModuleNavItem[] = [
  { id: 'shelf', label: '书架', icon: BookshelfIcon },
  { id: 'explore', label: '探索', icon: BookSearchIcon },
  { id: 'sources', label: '书源', icon: BookSourceIcon },
  { id: 'bookmark', label: '书签', icon: BookmarkIcon },
  { id: 'record', label: '记录', icon: RecordIcon },
  { id: 'rss', label: 'RSS', icon: RssTabIcon },
  { id: 'settings', label: '设置', icon: Settings2 },
];

const MUSIC_NAV: ModuleNavItem[] = [
  { id: 'search', label: '搜索', icon: Search },
  { id: 'songlist', label: '歌单', icon: Library },
  { id: 'leaderboard', label: '排行榜', icon: Trophy },
  { id: 'list', label: '我的列表', icon: ListMusic },
  { id: 'settings', label: '设置', icon: Settings2 },
];

const PLACEHOLDER_NAV: ModuleNavItem[] = [
  { id: 'home', label: '首页', icon: GroupVideoIcon },
];

export function getModuleNavItems(shellPage: PageType): ModuleNavItem[] {
  const page = normalizePageType(shellPage);
  switch (page) {
    case 'reader':
      return READER_NAV;
    case 'music':
      return MUSIC_NAV;
    case 'tv':
    case 'subscribe':
      return PLACEHOLDER_NAV;
    case 'settings':
      return [];
    default:
      return [];
  }
}

/** 桌面独立模块侧栏：当前模块是否有可展示的子导航 */
export function hasModuleSidebarRailContent(shellPage: PageType): boolean {
  const page = normalizePageType(shellPage);
  if (page === 'reader') return true;
  return getModuleNavItems(page).length > 0;
}

export function musicHubSectionValue(): MusicHubSection {
  return state.musicSection;
}

export function getActiveModuleNavId(shellPage: PageType): string {
  const page = normalizePageType(shellPage);
  switch (page) {
    case 'reader':
      return readerInternalTabValue();
    case 'music':
      return musicHubSectionValue();
    case 'tv':
    case 'subscribe':
      return 'home';
    default:
      return '';
  }
}

export function getActiveModuleNavIdForShell(shellPage: PageType): string {
  return getActiveModuleNavId(shellPage);
}

export function navigateModuleNav(shellPage: PageType, navId: string): void {
  const page = normalizePageType(shellPage);
  switch (page) {
    case 'reader':
      setReaderInternalTab(navId as ReaderInternalTab);
      break;
    case 'music':
      setMusicSection(navId as MusicHubSection);
      break;
    default:
      break;
  }
}

export function getModuleNavItemLabel(shellPage: PageType, navId: string): string {
  if (normalizePageType(shellPage) === 'reader' && navId === 'search') {
    return '搜索';
  }
  const items = getModuleNavItems(shellPage);
  return items.find((i) => i.id === navId)?.label ?? navId;
}

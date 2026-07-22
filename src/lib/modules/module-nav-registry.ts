/**
 * 壳模块内子页导航注册表（顶栏 / 融合侧栏 / 独立侧栏共用）
 */

import type { PageType } from '@/components/shell/Navigation';
import type { ReaderInternalTab } from '@/stores/reader-internal-tab';
import { readerInternalTabValue, setReaderInternalTab } from '@/stores/reader-internal-tab';
import type { MusicHubSection } from '@/stores/viewer/base-state';
import { state } from '@/stores/viewer/media/state';
import { setMusicSection } from '@/stores/viewer/media/audio';
import type { TvHubSection } from '@/lib/media/tv/types';
import { setTvSection, tvHubNavSectionValue } from '@/stores/tv-hub/section';
import {
  setSubscribeSection,
  subscribeHubSectionValue,
} from '@/stores/subscribe-hub/section';
import { normalizePageType } from '@/lib/media-shelf/compat-keys';
import {
  getModuleNavItems,
  type ModuleNavItem,
} from '@/lib/modules/module-nav-items';

export type { ModuleNavItem };
export { getModuleNavItems };

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
      return tvHubNavSectionValue();
    case 'subscribe':
      return subscribeHubSectionValue();
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
    case 'tv':
      setTvSection(navId as TvHubSection);
      break;
    case 'subscribe':
      setSubscribeSection(navId === 'settings' ? 'settings' : 'home');
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

/**
 * 壳模块侧栏子页清单（纯数据，无 store 依赖）
 */

import type { Component } from 'solid-js';
import {
  Search,
  Sparkles,
  ListMusic,
  Library,
  Trophy,
  Settings2,
  History,
  Heart,
  Radio,
  Home,
  Download,
  Globe,
  Clapperboard,
  Mic2,
  Disc3,
  Puzzle,
} from 'lucide-solid';
import type { PageType } from '@/components/shell/Navigation';
import {
  BookshelfIcon,
  BookSearchIcon,
  BookSourceIcon,
  BookmarkIcon,
  RecordIcon,
  RssTabIcon,
} from '@/components/shared/icons';

export type ModuleNavItem = {
  id: string;
  label: string;
  description?: string;
  icon?: Component<{ class?: string; size?: number }>;
};

/** 本地归一化，避免依赖 compat-keys（会经 shell-compat 形成循环初始化） */
function resolveModuleShellPage(shellPage: string): string {
  switch (shellPage) {
    case 'media':
    case 'bookshelf':
    case 'scout':
    case 'sources':
    case 'bookmark':
    case 'record':
    case 'rss':
    case 'book-search':
    case 'media-search':
      return 'reader';
    case 'subscription':
      return 'subscribe';
    default:
      return shellPage;
  }
}

export const READER_NAV: ModuleNavItem[] = [
  { id: 'shelf', label: '书架', icon: BookshelfIcon },
  { id: 'explore', label: '探索', icon: BookSearchIcon },
  { id: 'sources', label: '书源', icon: BookSourceIcon },
  { id: 'bookmark', label: '书签', icon: BookmarkIcon },
  { id: 'record', label: '记录', icon: RecordIcon },
  { id: 'rss', label: 'RSS', icon: RssTabIcon },
  { id: 'settings', label: '设置', icon: Settings2 },
];

export const MUSIC_NAV: ModuleNavItem[] = [
  { id: 'recommend', label: '推荐', icon: Sparkles },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'songlist', label: '歌单', icon: Library },
  { id: 'leaderboard', label: '排行榜', icon: Trophy },
  { id: 'artist', label: '歌手', icon: Mic2 },
  { id: 'album', label: '专辑', icon: Disc3 },
  { id: 'list', label: '我的列表', icon: ListMusic },
  { id: 'download', label: '下载', icon: Download },
  { id: 'settings', label: '设置', icon: Settings2 },
];

export const TV_NAV: ModuleNavItem[] = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'live', label: '直播', icon: Radio },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'bangumi', label: '番剧', icon: Clapperboard },
  { id: 'keep', label: '收藏', icon: Heart },
  { id: 'history', label: '历史', icon: History },
  { id: 'sniff', label: '嗅探', icon: Globe },
  { id: 'settings', label: '设置', icon: Settings2 },
];

/** 订阅模块使用自定义侧栏展示时间线和订阅源，不再显示首页/设置子项。 */
export const SUBSCRIBE_NAV: ModuleNavItem[] = [];

export const DOWNLOAD_NAV: ModuleNavItem[] = [
  { id: 'tasks', label: '任务', icon: Download },
  { id: 'create', label: '新建', icon: Globe },
  { id: 'extensions', label: '扩展', icon: Puzzle },
  { id: 'settings', label: '设置', icon: Settings2 },
];

export function getModuleNavItems(shellPage: PageType): ModuleNavItem[] {
  const page = resolveModuleShellPage(shellPage);
  switch (page) {
    case 'reader':
      return READER_NAV;
    case 'music':
      return MUSIC_NAV;
    case 'tv':
      return TV_NAV;
    case 'subscribe':
      return SUBSCRIBE_NAV;
    case 'download':
      return DOWNLOAD_NAV;
    case 'settings':
      return [];
    default:
      return [];
  }
}

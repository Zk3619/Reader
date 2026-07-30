/**
 * Shell 导航显示配置（MediaBox 品牌层）
 */

import type { Component } from 'solid-js';
import type { PageType } from '@/components/shell/Navigation';
import {
  BookshelfIcon,
  BookSourceIcon,
  RssTabIcon,
  BookmarkIcon,
  RecordIcon,
  SettingsIcon,
  GlobeIcon,
  BookInfoIcon,
  BookOpenIcon,
  MusicTabIcon,
  TvTabIcon,
  DownloadIcon,
} from '@/components/shared/icons';

export const APP_DISPLAY_NAME = 'MediaBox';

export type ShellPageConfigEntry = {
  label: string;
  icon: Component<any>;
  description: string;
};

/** 主壳页与叠层页统一配置 */
export const SHELL_PAGE_CONFIG: Record<PageType, ShellPageConfigEntry> = {
  reader: { label: '阅读', icon: BookOpenIcon, description: 'Legado 书架、探索、书源与阅读记录' },
  music: { label: '音乐', icon: MusicTabIcon, description: 'lx-music 在线音乐与歌单' },
  tv: { label: '影视', icon: TvTabIcon, description: '影视点播与直播' },
  subscribe: { label: '订阅', icon: RssTabIcon, description: 'Folo 信息流订阅' },
  download: { label: '下载', icon: DownloadIcon, description: '通用协议下载与媒体站点提取' },
  /** @deprecated alias */
  media: { label: '阅读', icon: BookOpenIcon, description: 'Legado 书架、探索、书源与阅读记录' },
  /** @deprecated alias */
  bookshelf: { label: '阅读', icon: BookOpenIcon, description: 'Legado 书架、探索、书源与阅读记录' },
  /** @deprecated alias */
  scout: { label: '探索', icon: BookOpenIcon, description: '浏览书源发现分类与书籍' },
  /** @deprecated alias */
  sources: { label: '书源', icon: BookSourceIcon, description: 'Legado 书源管理' },
  explore: { label: '发现', icon: BookSourceIcon, description: '书源发现分类书籍列表' },
  /** @deprecated alias */
  rss: { label: '订阅', icon: RssTabIcon, description: '订阅更新' },
  /** @deprecated alias */
  bookmark: { label: '书签', icon: BookmarkIcon, description: '查看书签' },
  /** @deprecated alias */
  record: { label: '记录', icon: RecordIcon, description: '阅读记录' },
  settings: { label: '设置', icon: SettingsIcon, description: '应用设置' },
  'remote-book': { label: '远程书籍', icon: GlobeIcon, description: '浏览和导入远程书籍' },
  'text-viewer': { label: '文本', icon: BookmarkIcon, description: '文本阅读' },
  'image-viewer': { label: '漫画', icon: BookmarkIcon, description: '图片阅读' },
  'audio-viewer': { label: '听书', icon: BookmarkIcon, description: '音频播放' },
  'video-viewer': { label: '视频', icon: BookmarkIcon, description: '视频播放' },
  'file-viewer': { label: '文件', icon: BookmarkIcon, description: '文件阅读' },
  'pdf-viewer': { label: 'PDF', icon: BookmarkIcon, description: 'PDF 阅读' },
  'book-info': { label: '书籍信息', icon: BookInfoIcon, description: '查看书籍详细信息' },
  'media-search': { label: '搜索', icon: BookOpenIcon, description: '搜索媒体库与全网书籍' },
  /** @deprecated alias */
  'book-search': { label: '搜索', icon: BookOpenIcon, description: '搜索媒体库与全网书籍' },
  'media-cache': {
    label: '离线缓存',
    icon: BookshelfIcon,
    description: '批量缓存与导出正文',
  },
  /** @deprecated alias */
  'bookshelf-cache': {
    label: '离线缓存',
    icon: BookshelfIcon,
    description: '批量缓存与导出正文',
  },
};

/** 顶栏页面下拉中隐藏的 PageType */
export const NAV_HIDDEN_SHELL_PAGES: PageType[] = [
  'media',
  'bookshelf',
  'scout',
  'sources',
  'rss',
  'bookmark',
  'record',
  'explore',
  'remote-book',
  'text-viewer',
  'image-viewer',
  'audio-viewer',
  'video-viewer',
  'file-viewer',
  'pdf-viewer',
  'book-info',
  'media-search',
  'book-search',
  'media-cache',
  'bookshelf-cache',
];

export const NAV_MENU_SHELL_PAGES = Object.entries(SHELL_PAGE_CONFIG).filter(
  ([page]) => !NAV_HIDDEN_SHELL_PAGES.includes(page as PageType),
);

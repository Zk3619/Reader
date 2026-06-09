/**
 * 移动端设置页主列表：书签 / 阅读记录等快捷入口
 */

import type { Component } from 'solid-js';
import type { PageType } from '@/components/shell/Navigation';
import { BookmarkIcon, RecordIcon } from '@/components/shared/icons';

export interface SettingsMobileQuickPageDef {
  page: PageType;
  label: string;
  description: string;
  icon: Component<{ class?: string; size?: number }>;
}

/** 显示在「外观与主题」分类之前的快捷页入口（仅移动端设置主列表） */
export const SETTINGS_MOBILE_QUICK_PAGES: SettingsMobileQuickPageDef[] = [
  {
    page: 'bookmark',
    label: '书签',
    description: '查看全部书签',
    icon: BookmarkIcon,
  },
  {
    page: 'record',
    label: '阅读记录',
    description: '查看阅读时长与历史',
    icon: RecordIcon,
  },
];

/**
 * Shell 模块注册表（壳层统一 + 各模块独立）
 */

import type { PageType } from '@/components/shell/Navigation';

export type ShellModuleId = 'reader' | 'music' | 'tv' | 'subscribe' | 'download';

export interface ShellModuleEntry {
  id: ShellModuleId;
  shellPage: PageType;
  label: string;
  description: string;
}

export const SHELL_MODULES: ShellModuleEntry[] = [
  {
    id: 'reader',
    shellPage: 'reader',
    label: '阅读',
    description: 'Legado 书架、探索、书源、书签与阅读记录',
  },
  {
    id: 'music',
    shellPage: 'music',
    label: '音乐',
    description: 'lx-music 在线音乐与歌单',
  },
  {
    id: 'tv',
    shellPage: 'tv',
    label: '影视',
    description: '影视点播与直播',
  },
  {
    id: 'subscribe',
    shellPage: 'subscribe',
    label: '订阅',
    description: 'Folo 信息流订阅（开发中）',
  },
  {
    id: 'download',
    shellPage: 'download',
    label: '下载',
    description: '通用协议下载与媒体站点提取',
  },
];

export const SHELL_MODULE_PAGES: PageType[] = [
  'reader',
  'music',
  'tv',
  'subscribe',
  'download',
  'settings',
];

export function isShellModulePage(page: PageType): boolean {
  return SHELL_MODULE_PAGES.includes(page);
}

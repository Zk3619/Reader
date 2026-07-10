/**
 * 媒体库 Tab 动态文案（MediaShelf）
 */

import type { MediaKind } from '@/lib/book-source/book-type';

export interface MediaShelfLabels {
  /** 空分组时的库名，如「书架」「图库」 */
  shelfName: string;
  /** 条目单位，如「本书」「部作品」 */
  itemUnit: string;
  /** 分组列表页标题 */
  groupPageTitle: string;
  /** 计数：共 N 条 */
  countItems: (n: number) => string;
  /** 计数：共 N 个分组 */
  countGroups: (n: number) => string;
  /** 管理菜单 */
  manageMenu: string;
  layoutMenu: string;
  groupManageMenu: string;
  exportMenu: string;
  importMenu: string;
  emptyGroup: string;
  removedFromShelf: string;
}

const LABELS: Record<MediaKind, MediaShelfLabels> = {
  text: {
    shelfName: '书架',
    itemUnit: '本书',
    groupPageTitle: '分组',
    countItems: (n) => `共 ${n} 本书`,
    countGroups: (n) => `共 ${n} 个分组`,
    manageMenu: '书架管理',
    layoutMenu: '书架布局',
    groupManageMenu: '分组管理',
    exportMenu: '导出书单',
    importMenu: '导入书单',
    emptyGroup: '该分组下还没有书籍',
    removedFromShelf: '已从书架删除',
  },
  image: {
    shelfName: '图库',
    itemUnit: '本图册',
    groupPageTitle: '分组',
    countItems: (n) => `共 ${n} 本图册`,
    countGroups: (n) => `共 ${n} 个分组`,
    manageMenu: '图库管理',
    layoutMenu: '图库布局',
    groupManageMenu: '分组管理',
    exportMenu: '导出图库',
    importMenu: '导入图库',
    emptyGroup: '该分组下还没有图册',
    removedFromShelf: '已从图库删除',
  },
  audio: {
    shelfName: '听书架',
    itemUnit: '本书',
    groupPageTitle: '分组',
    countItems: (n) => `共 ${n} 本书`,
    countGroups: (n) => `共 ${n} 个分组`,
    manageMenu: '听书架管理',
    layoutMenu: '听书架布局',
    groupManageMenu: '分组管理',
    exportMenu: '导出书单',
    importMenu: '导入书单',
    emptyGroup: '该分组下还没有有声书',
    removedFromShelf: '已从听书架删除',
  },
  video: {
    shelfName: '片库',
    itemUnit: '部作品',
    groupPageTitle: '分组',
    countItems: (n) => `共 ${n} 部作品`,
    countGroups: (n) => `共 ${n} 个分组`,
    manageMenu: '片库管理',
    layoutMenu: '片库布局',
    groupManageMenu: '分组管理',
    exportMenu: '导出片库',
    importMenu: '导入片库',
    emptyGroup: '该分组下还没有作品',
    removedFromShelf: '已从片库删除',
  },
  file: {
    shelfName: '文件库',
    itemUnit: '个文件',
    groupPageTitle: '分组',
    countItems: (n) => `共 ${n} 个文件`,
    countGroups: (n) => `共 ${n} 个分组`,
    manageMenu: '文件库管理',
    layoutMenu: '文件库布局',
    groupManageMenu: '分组管理',
    exportMenu: '导出列表',
    importMenu: '导入列表',
    emptyGroup: '该分组下还没有文件',
    removedFromShelf: '已从文件库删除',
  },
};

export function getMediaShelfLabels(mediaKind?: MediaKind): MediaShelfLabels {
  return LABELS[mediaKind ?? 'text'] ?? LABELS.text;
}

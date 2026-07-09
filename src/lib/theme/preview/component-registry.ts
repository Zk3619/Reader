/**
 * 主题预览组件 Registry — 组件树 + 可编辑路径
 */

import type {
  AppComponentId,
  EditableTokenPath,
  ThemeComponentId,
  ViewerComponentId,
} from '@/lib/theme/schema/theme-pack-v1';

export type ThemePreviewDomain = 'app' | 'viewer';

export interface ThemeComponentDescriptor {
  id: ThemeComponentId;
  label: string;
  domain: ThemePreviewDomain;
  parentId?: ThemeComponentId;
  editablePaths: EditableTokenPath[];
  scopeAttr: string;
}

export const APP_COMPONENT_REGISTRY: ThemeComponentDescriptor[] = [
  {
    id: 'appShell',
    label: '应用壳层',
    domain: 'app',
    editablePaths: ['app.tokens.light', 'app.tokens.dark', 'app.typography', 'app.motion', 'app.components.appShell'],
    scopeAttr: 'appShell',
  },
  {
    id: 'topNav',
    label: '顶部导航栏',
    domain: 'app',
    parentId: 'appShell',
    editablePaths: ['app.tokens.light', 'app.tokens.dark', 'app.components.topNav'],
    scopeAttr: 'topNav',
  },
  {
    id: 'pageContent',
    label: '页面主区域',
    domain: 'app',
    parentId: 'appShell',
    editablePaths: ['app.components.pageContent'],
    scopeAttr: 'pageContent',
  },
  {
    id: 'sidebar',
    label: '侧边栏',
    domain: 'app',
    parentId: 'appShell',
    editablePaths: [
      'app.tokens.light.sidebar',
      'app.tokens.dark.sidebar',
      'app.components.sidebar',
    ],
    scopeAttr: 'sidebar',
  },
  {
    id: 'sidebarHeader',
    label: '侧栏上部',
    domain: 'app',
    parentId: 'sidebar',
    editablePaths: ['app.components.sidebarHeader'],
    scopeAttr: 'sidebarHeader',
  },
  {
    id: 'sidebarNav',
    label: '侧栏导航',
    domain: 'app',
    parentId: 'sidebar',
    editablePaths: ['app.components.sidebarNav'],
    scopeAttr: 'sidebarNav',
  },
  {
    id: 'sidebarRecent',
    label: '最近阅读',
    domain: 'app',
    parentId: 'sidebar',
    editablePaths: ['app.components.sidebarRecent'],
    scopeAttr: 'sidebarRecent',
  },
  {
    id: 'sidebarFooter',
    label: '侧栏底部',
    domain: 'app',
    parentId: 'sidebar',
    editablePaths: ['app.components.sidebarFooter'],
    scopeAttr: 'sidebarFooter',
  },
  {
    id: 'pageToolbar',
    label: '页头工具栏',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.pageToolbar'],
    scopeAttr: 'pageToolbar',
  },
  {
    id: 'bookshelfCard',
    label: '书架卡片',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.bookshelfCard', 'app.tokens.light.card', 'app.tokens.dark.card'],
    scopeAttr: 'bookshelfCard',
  },
  {
    id: 'bookshelfGroupCard',
    label: '书架分组卡片',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.bookshelfGroupCard'],
    scopeAttr: 'bookshelfGroupCard',
  },
  {
    id: 'settingsCard',
    label: '设置分类卡片',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.settingsCard'],
    scopeAttr: 'settingsCard',
  },
  {
    id: 'settingsTabPanel',
    label: '设置 Tab 面板',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.settingsTabPanel'],
    scopeAttr: 'settingsTabPanel',
  },
  {
    id: 'recordCard',
    label: '阅读记录卡片',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.recordCard'],
    scopeAttr: 'recordCard',
  },
  {
    id: 'surfaceCard',
    label: '通用表面卡片',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.surfaceCard'],
    scopeAttr: 'surfaceCard',
  },
  {
    id: 'settingsRow',
    label: '设置行',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.settingsRow'],
    scopeAttr: 'settingsRow',
  },
  {
    id: 'button',
    label: '按钮',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.tokens.light.primary', 'app.tokens.dark.primary', 'app.components.button'],
    scopeAttr: 'button',
  },
  {
    id: 'dialog',
    label: '对话框',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.dialog', 'app.tokens.light.popover', 'app.tokens.dark.popover'],
    scopeAttr: 'dialog',
  },
  {
    id: 'dropdown',
    label: '下拉菜单',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.dropdown'],
    scopeAttr: 'dropdown',
  },
  {
    id: 'drawer',
    label: '抽屉',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.drawer'],
    scopeAttr: 'drawer',
  },
  {
    id: 'combobox',
    label: 'Combobox',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.combobox'],
    scopeAttr: 'combobox',
  },
  {
    id: 'contextMenu',
    label: '右键菜单',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.contextMenu'],
    scopeAttr: 'contextMenu',
  },
  {
    id: 'select',
    label: '选择器',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.select'],
    scopeAttr: 'select',
  },
  {
    id: 'toast',
    label: 'Toast',
    domain: 'app',
    parentId: 'pageContent',
    editablePaths: ['app.components.toast'],
    scopeAttr: 'toast',
  },
];

export const VIEWER_COMPONENT_REGISTRY: ThemeComponentDescriptor[] = [
  {
    id: 'readerChrome',
    label: '阅读器 Chrome',
    domain: 'viewer',
    editablePaths: ['viewer.shared', 'viewer.components.readerChrome'],
    scopeAttr: 'readerChrome',
  },
  {
    id: 'toolbarHeader',
    label: '顶栏',
    domain: 'viewer',
    parentId: 'readerChrome',
    editablePaths: ['viewer.components.toolbarHeader', 'viewer.text.chromeBackground'],
    scopeAttr: 'toolbarHeader',
  },
  {
    id: 'footerChrome',
    label: '底栏',
    domain: 'viewer',
    parentId: 'readerChrome',
    editablePaths: ['viewer.components.footerChrome'],
    scopeAttr: 'footerChrome',
  },
  {
    id: 'contentSlot',
    label: '正文区',
    domain: 'viewer',
    parentId: 'readerChrome',
    editablePaths: ['viewer.text.paletteId', 'viewer.text.customPalette', 'viewer.text.contentBackground', 'viewer.text.surfaceAppearance.content'],
    scopeAttr: 'contentSlot',
  },
  {
    id: 'pageTip',
    label: '页眉页脚',
    domain: 'viewer',
    parentId: 'readerChrome',
    editablePaths: ['viewer.text.surfaceAppearance.pageTip'],
    scopeAttr: 'pageTip',
  },
  {
    id: 'brightnessCapsule',
    label: '亮度胶囊',
    domain: 'viewer',
    parentId: 'readerChrome',
    editablePaths: ['viewer.text.surfaceAppearance.brightness'],
    scopeAttr: 'brightnessCapsule',
  },
  {
    id: 'imageStage',
    label: '图片 Stage',
    domain: 'viewer',
    parentId: 'readerChrome',
    editablePaths: ['viewer.image.stageBackground'],
    scopeAttr: 'imageStage',
  },
  {
    id: 'videoControls',
    label: '视频控件',
    domain: 'viewer',
    parentId: 'readerChrome',
    editablePaths: ['viewer.video.controlsAccent', 'viewer.video.stageBackground'],
    scopeAttr: 'videoControls',
  },
];

export const THEME_COMPONENT_REGISTRY: ThemeComponentDescriptor[] = [
  ...APP_COMPONENT_REGISTRY,
  ...VIEWER_COMPONENT_REGISTRY,
];

export function getThemeComponent(id: ThemeComponentId): ThemeComponentDescriptor | undefined {
  return THEME_COMPONENT_REGISTRY.find((c) => c.id === id);
}

export function listThemeComponents(domain?: ThemePreviewDomain): ThemeComponentDescriptor[] {
  if (!domain) return THEME_COMPONENT_REGISTRY;
  return THEME_COMPONENT_REGISTRY.filter((c) => c.domain === domain);
}

export function listRootThemeComponents(domain: ThemePreviewDomain): ThemeComponentDescriptor[] {
  return listThemeComponents(domain).filter((c) => !c.parentId);
}

export function listChildThemeComponents(parentId: ThemeComponentId): ThemeComponentDescriptor[] {
  return THEME_COMPONENT_REGISTRY.filter((c) => c.parentId === parentId);
}

export function isAppComponentId(id: ThemeComponentId): id is AppComponentId {
  return APP_COMPONENT_REGISTRY.some((c) => c.id === id);
}

export function isViewerComponentId(id: ThemeComponentId): id is ViewerComponentId {
  return VIEWER_COMPONENT_REGISTRY.some((c) => c.id === id);
}

export function componentDataAttr(id: ThemeComponentId): Record<string, string> {
  return { 'data-theme-component': id };
}

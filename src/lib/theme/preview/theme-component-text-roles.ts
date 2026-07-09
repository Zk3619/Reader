/**
 * 主题工作室 — 组件文字角色与 CSS 变量预设（单一来源）
 */

import type { ThemeComponentId } from '@/lib/theme/schema/theme-pack-v1';
import type { SemanticTokenGroup } from '@/lib/theme/theme-semantic-colors';
import type { SemanticColorTokens } from '@/lib/theme/types';

export interface ComponentCssVarPreset {
  label: string;
  varName: string;
}

export type ComponentTextSurface =
  | 'card'
  | 'sidebar'
  | 'popover'
  | 'surface'
  | 'primary';

const SURFACE_CSS_VAR_PRESETS: Record<ComponentTextSurface, ComponentCssVarPreset[]> = {
  card: [
    { label: '背景', varName: '--card' },
    { label: '主文字', varName: '--card-foreground' },
    { label: '副文字', varName: '--muted-foreground' },
  ],
  sidebar: [
    { label: '背景', varName: '--sidebar' },
    { label: '主文字', varName: '--sidebar-foreground' },
    { label: '副文字', varName: '--muted-foreground' },
    { label: '强调', varName: '--sidebar-accent' },
    { label: '边框', varName: '--sidebar-border' },
  ],
  popover: [
    { label: '背景', varName: '--popover' },
    { label: '主文字', varName: '--popover-foreground' },
    { label: '副文字', varName: '--muted-foreground' },
  ],
  surface: [
    { label: '背景', varName: '--background' },
    { label: '主文字', varName: '--foreground' },
    { label: '副文字', varName: '--muted-foreground' },
  ],
  primary: [
    { label: '背景', varName: '--primary' },
    { label: '文字', varName: '--primary-foreground' },
  ],
};

/** 按钮各变体对应的 Token（default / secondary / outline / destructive / link） */
const BUTTON_CSS_VAR_PRESETS: ComponentCssVarPreset[] = [
  { label: '主要按钮背景', varName: '--primary' },
  { label: '主要按钮文字', varName: '--primary-foreground' },
  { label: '次要按钮背景', varName: '--secondary' },
  { label: '次要按钮文字', varName: '--secondary-foreground' },
  { label: '描边/幽灵文字', varName: '--foreground' },
  { label: '描边边框', varName: '--input' },
  { label: '悬停强调背景', varName: '--accent' },
  { label: '悬停强调文字', varName: '--accent-foreground' },
  { label: '危险按钮背景', varName: '--destructive' },
  { label: '危险按钮文字', varName: '--destructive-foreground' },
];

/** 各预览组件对应的文字/背景 Token 表面 */
export const COMPONENT_TEXT_SURFACE: Partial<Record<ThemeComponentId, ComponentTextSurface>> = {
  appShell: 'surface',
  topNav: 'surface',
  pageContent: 'surface',
  sidebar: 'sidebar',
  sidebarHeader: 'sidebar',
  sidebarNav: 'sidebar',
  sidebarRecent: 'sidebar',
  sidebarFooter: 'sidebar',
  pageToolbar: 'surface',
  bookshelfCard: 'card',
  bookshelfGroupCard: 'card',
  settingsCard: 'card',
  settingsTabPanel: 'surface',
  settingsRow: 'card',
  recordCard: 'card',
  surfaceCard: 'card',
  button: 'primary',
  dialog: 'popover',
  dropdown: 'popover',
  select: 'popover',
  combobox: 'popover',
  contextMenu: 'popover',
  drawer: 'surface',
  toast: 'card',
  readerChrome: 'surface',
  toolbarHeader: 'surface',
  footerChrome: 'surface',
  pageTip: 'surface',
  brightnessCapsule: 'surface',
  imageStage: 'surface',
  videoControls: 'surface',
};

/** 按组件细化 Inspector 中的文字角色标签（变量名不变） */
const COMPONENT_PRESET_LABEL_OVERRIDES: Partial<
  Record<ThemeComponentId, Partial<Record<string, string>>>
> = {
  bookshelfCard: {
    '--card-foreground': '书名',
    '--muted-foreground': '作者',
  },
  bookshelfGroupCard: {
    '--card-foreground': '分组名',
    '--muted-foreground': '副标题',
  },
  settingsCard: {
    '--card-foreground': '分类标题',
    '--muted-foreground': '分类说明',
  },
  settingsRow: {
    '--card-foreground': '设置项标题',
    '--muted-foreground': '设置项说明',
  },
  recordCard: {
    '--card-foreground': '记录标题',
    '--muted-foreground': '记录副标题',
  },
  surfaceCard: {
    '--card-foreground': '列表标题',
    '--muted-foreground': '列表副标题',
  },
  pageToolbar: {
    '--foreground': '页头标题',
    '--muted-foreground': '页头说明',
  },
  topNav: {
    '--foreground': '导航标题',
    '--muted-foreground': '导航说明',
  },
  dialog: {
    '--popover-foreground': '对话框标题',
    '--muted-foreground': '对话框正文',
  },
  dropdown: {
    '--popover-foreground': '菜单项文字',
    '--muted-foreground': '菜单说明',
  },
  select: {
    '--popover-foreground': '选中项',
    '--muted-foreground': '未选中项',
  },
  combobox: {
    '--popover-foreground': '输入/选中文字',
    '--muted-foreground': '占位/提示',
  },
  contextMenu: {
    '--popover-foreground': '菜单项文字',
  },
  drawer: {
    '--foreground': '抽屉标题',
    '--muted-foreground': '抽屉正文',
  },
  toast: {
    '--card-foreground': 'Toast 文字',
  },
  sidebarNav: {
    '--sidebar-foreground': '导航项文字',
    '--muted-foreground': '导航说明',
  },
  sidebarRecent: {
    '--sidebar-foreground': '书名',
    '--muted-foreground': '章节',
  },
  sidebarFooter: {
    '--sidebar-foreground': '底部操作文字',
  },
  toolbarHeader: {
    '--foreground': '书名/标题',
    '--muted-foreground': '图标/辅助',
  },
  footerChrome: {
    '--foreground': '底栏操作文字',
    '--muted-foreground': '底栏辅助',
  },
  pageTip: {
    '--foreground': '页码信息',
    '--muted-foreground': '字数等辅助',
  },
  brightnessCapsule: {
    '--foreground': '亮度文字',
  },
};

const BACKGROUND_CSS_VARS = new Set([
  '--sidebar',
  '--background',
  '--card',
  '--primary',
  '--popover',
  '--secondary',
  '--accent',
  '--destructive',
]);

const CSS_VAR_TO_SEMANTIC_KEY: Partial<Record<string, keyof SemanticColorTokens>> = {
  '--sidebar': 'sidebar',
  '--background': 'background',
  '--card': 'card',
  '--card-foreground': 'cardForeground',
  '--muted-foreground': 'mutedForeground',
  '--primary': 'primary',
  '--popover': 'popover',
  '--secondary': 'secondary',
  '--accent': 'accent',
  '--destructive': 'destructive',
  '--foreground': 'foreground',
  '--sidebar-foreground': 'sidebarForeground',
  '--popover-foreground': 'popoverForeground',
  '--primary-foreground': 'primaryForeground',
};

export function getComponentTextSurface(
  componentId: ThemeComponentId,
): ComponentTextSurface | undefined {
  return COMPONENT_TEXT_SURFACE[componentId];
}

export function getComponentCssVarPresets(componentId: ThemeComponentId): ComponentCssVarPreset[] {
  if (componentId === 'button') {
    return [...BUTTON_CSS_VAR_PRESETS];
  }
  const surface = getComponentTextSurface(componentId);
  if (!surface) return [];
  const overrides = COMPONENT_PRESET_LABEL_OVERRIDES[componentId];
  return SURFACE_PRESETS(surface).map((preset) => ({
    ...preset,
    label: overrides?.[preset.varName] ?? preset.label,
  }));
}

/** Inspector 组件 CSS 变量区的补充说明 */
export function getComponentCssVarPresetHint(componentId: ThemeComponentId): string | undefined {
  if (componentId === 'button') {
    return '主要/链接→primary；次要→secondary 文字；描边/幽灵→foreground；悬停→accent 文字；危险→destructive 文字。';
  }
  return undefined;
}

function SURFACE_PRESETS(surface: ComponentTextSurface): ComponentCssVarPreset[] {
  return [...SURFACE_CSS_VAR_PRESETS[surface]];
}

/** 过滤与当前可编辑语义色重复的背景类变量 */
export function filterComponentCssVarPresets(
  presets: ComponentCssVarPreset[],
  semanticGroups: SemanticTokenGroup[],
): ComponentCssVarPreset[] {
  const semanticKeys = new Set(semanticGroups.flatMap((g) => g.keys));
  return presets.filter((preset) => {
    if (!BACKGROUND_CSS_VARS.has(preset.varName)) return true;
    const semanticKey = CSS_VAR_TO_SEMANTIC_KEY[preset.varName];
    return !(semanticKey && semanticKeys.has(semanticKey));
  });
}

/** 主文字 Tailwind class（消费组件 scoped CSS 变量） */
export function themePreviewPrimaryTextClass(componentId: ThemeComponentId): string {
  switch (getComponentTextSurface(componentId)) {
    case 'card':
      return 'text-card-foreground';
    case 'sidebar':
      return 'text-sidebar-foreground';
    case 'popover':
      return 'text-popover-foreground';
    case 'primary':
      return 'text-primary-foreground';
    default:
      return 'text-foreground';
  }
}

/** 副文字 / 说明（继承组件上覆写的 --muted-foreground） */
export function themePreviewMutedTextClass(_componentId?: ThemeComponentId): string {
  return 'text-muted-foreground';
}

/** 主/副文字 class 组合（常用于标题块） */
export function themePreviewTextClasses(componentId: ThemeComponentId): {
  primary: string;
  muted: string;
} {
  return {
    primary: themePreviewPrimaryTextClass(componentId),
    muted: themePreviewMutedTextClass(componentId),
  };
}

/** 组件壳层背景 + 默认主色文字 */
export function themePreviewSurfaceShellClass(componentId: ThemeComponentId): string {
  switch (getComponentTextSurface(componentId)) {
    case 'card':
      return 'bg-card text-card-foreground';
    case 'sidebar':
      return 'bg-sidebar text-sidebar-foreground';
    case 'popover':
      return 'bg-popover text-popover-foreground';
    case 'primary':
      // 主色 Token 作用于内部按钮，预览壳层保持中性卡片底色
      return 'bg-card text-card-foreground';
    default:
      return 'bg-background text-foreground';
  }
}

/**
 * 根据组件 registry editablePaths 决定 Inspector 展示哪些编辑项
 */

import type { ThemeComponentDescriptor } from '@/lib/theme/preview/component-registry';
import {
  SEMANTIC_TOKEN_GROUPS,
  type SemanticTokenGroup,
} from '@/lib/theme/theme-semantic-colors';
import {
  LAYOUT_TOKEN_GROUPS,
  type LayoutTokenGroup,
} from '@/lib/theme/theme-layout-tokens';
import type { SemanticColorTokens, LayoutTokens } from '@/lib/theme/types';
import type { ThemeApplyScope } from '@/lib/theme/schema/theme-pack-v1';

export interface InspectorEditableSections {
  semanticGroups: SemanticTokenGroup[];
  layoutGroups: LayoutTokenGroup[];
  showTypography: boolean;
  showMotion: boolean;
  showComponentOverride: boolean;
  showComponentBackground: boolean;
  showViewerPalette: boolean;
  showViewerContentBackground: boolean;
  showViewerChrome: boolean;
  showViewerShared: boolean;
  /** tsParticles 为 advanced 全局配置，在 viewer/all 作用域下始终可编辑 */
  showTsParticles: boolean;
  /** 底色透明度/模糊（组件 surface 或阅读器 content/chrome） */
  showComponentSurfaceAppearance: boolean;
  showViewerChromeSurface: boolean;
}

const ALL_SEMANTIC_KEYS = new Set(
  SEMANTIC_TOKEN_GROUPS.flatMap((g) => g.keys),
);

function parseSemanticKeysFromPaths(
  paths: readonly string[],
  mode: 'light' | 'dark',
): Set<keyof SemanticColorTokens> | 'all' {
  const keys = new Set<keyof SemanticColorTokens>();
  let all = false;

  for (const path of paths) {
    if (path === 'app.tokens.light' || path === 'app.tokens.dark') {
      all = true;
      continue;
    }
    const match = path.match(/^app\.tokens\.(light|dark)\.([A-Za-z]+)$/);
    if (!match) continue;
    const [, pathMode, key] = match;
    if (pathMode !== mode) continue;
    if (ALL_SEMANTIC_KEYS.has(key as keyof SemanticColorTokens)) {
      keys.add(key as keyof SemanticColorTokens);
    }
  }

  if (all) return 'all';
  return keys;
}

function filterSemanticGroups(
  keys: Set<keyof SemanticColorTokens> | 'all',
): SemanticTokenGroup[] {
  if (keys === 'all') return SEMANTIC_TOKEN_GROUPS;
  if (keys.size === 0) return [];
  return SEMANTIC_TOKEN_GROUPS.map((group) => ({
    ...group,
    keys: group.keys.filter((key) => keys.has(key)),
  })).filter((group) => group.keys.length > 0);
}

function parseLayoutKeys(paths: readonly string[]): Set<keyof LayoutTokens> | 'all' {
  const keys = new Set<keyof LayoutTokens>();
  let all = false;

  for (const path of paths) {
    if (path.startsWith('app.tokens.') && !path.includes('.light') && !path.includes('.dark')) {
      all = true;
    }
    if (path === 'app.tokens.light' || path === 'app.tokens.dark') {
      all = true;
    }
    const match = path.match(/^app\.tokens\.layout\.(\w+)$/);
    if (match) {
      keys.add(match[1] as keyof LayoutTokens);
    }
  }

  if (all) return 'all';
  return keys;
}

function filterLayoutGroups(keys: Set<keyof LayoutTokens> | 'all'): LayoutTokenGroup[] {
  if (keys === 'all') return LAYOUT_TOKEN_GROUPS;
  if (keys.size === 0) return [];
  return LAYOUT_TOKEN_GROUPS.map((group) => ({
    ...group,
    keys: group.keys.filter((key) => keys.has(key)),
  })).filter((group) => group.keys.length > 0);
}

export function resolveInspectorEditableSections(
  descriptor: ThemeComponentDescriptor | undefined,
  colorMode: 'light' | 'dark',
  scope: ThemeApplyScope = 'all',
): InspectorEditableSections {
  const paths = descriptor?.editablePaths ?? [];
  const hasAppComponent = paths.some((p) => p.startsWith('app.components.'));
  const hasViewerComponent = paths.some((p) => p.startsWith('viewer.components.'));
  const semanticKeys = parseSemanticKeysFromPaths(paths, colorMode);
  const showViewerContentBackground = paths.some(
    (p) => p.includes('contentBackground') || p.includes('stageBackground'),
  );
  const showViewerChromeSurface = paths.some(
    (p) => p.includes('chromeBackground') || p.includes('surfaceAppearance.chrome'),
  );

  return {
    semanticGroups: filterSemanticGroups(semanticKeys),
    layoutGroups: filterLayoutGroups(parseLayoutKeys(paths)),
    showTypography: paths.includes('app.typography'),
    showMotion: paths.includes('app.motion'),
    showComponentOverride: hasAppComponent || hasViewerComponent,
    showComponentBackground: hasAppComponent || hasViewerComponent,
    showViewerPalette: paths.some((p) => p.startsWith('viewer.text.paletteId') || p === 'viewer.text.customPalette'),
    showViewerContentBackground,
    showViewerChrome: paths.some(
      (p) => p.includes('chromeBackground') || p.includes('surfaceAppearance'),
    ),
    showViewerShared: paths.includes('viewer.shared'),
    showTsParticles: scope === 'viewer' || scope === 'all',
    showComponentSurfaceAppearance:
      (hasAppComponent || hasViewerComponent) &&
      !showViewerContentBackground &&
      !showViewerChromeSurface,
    showViewerChromeSurface,
  };
}

/** 与语义色「背景类」Token 重叠的 CSS 变量 — 已在颜色 Tab 编辑时不再重复展示 */
const BACKGROUND_CSS_VARS = new Set([
  '--sidebar',
  '--background',
  '--card',
  '--primary',
  '--popover',
]);

const CSS_VAR_TO_SEMANTIC_KEY: Partial<Record<string, keyof SemanticColorTokens>> = {
  '--sidebar': 'sidebar',
  '--background': 'background',
  '--card': 'card',
  '--primary': 'primary',
  '--popover': 'popover',
};

/** 过滤与当前可编辑语义色重复的「背景」类组件 CSS 变量 */
export function filterComponentCssVarPresets(
  presets: { label: string; varName: string }[],
  semanticGroups: SemanticTokenGroup[],
): { label: string; varName: string }[] {
  const semanticKeys = new Set(semanticGroups.flatMap((g) => g.keys));
  return presets.filter((preset) => {
    if (!BACKGROUND_CSS_VARS.has(preset.varName)) return true;
    const semanticKey = CSS_VAR_TO_SEMANTIC_KEY[preset.varName];
    return !(semanticKey && semanticKeys.has(semanticKey));
  });
}

/** 侧栏等组件常用的 CSS 变量快捷编辑（文字/强调/边框；背景色请用语义色或阅读配色） */
export const COMPONENT_CSS_VAR_PRESETS: Record<
  string,
  { label: string; varName: string }[]
> = {
  sidebar: [
    { label: '侧栏背景', varName: '--sidebar' },
    { label: '侧栏文字', varName: '--sidebar-foreground' },
    { label: '侧栏强调', varName: '--sidebar-accent' },
    { label: '侧栏边框', varName: '--sidebar-border' },
  ],
  sidebarNav: [
    { label: '导航背景', varName: '--sidebar' },
    { label: '导航文字', varName: '--sidebar-foreground' },
  ],
  sidebarRecent: [
    { label: '区块背景', varName: '--sidebar' },
    { label: '区块文字', varName: '--sidebar-foreground' },
  ],
  pageContent: [
    { label: '页面背景', varName: '--background' },
    { label: '页面文字', varName: '--foreground' },
  ],
  pageToolbar: [
    { label: '工具栏背景', varName: '--background' },
    { label: '工具栏文字', varName: '--foreground' },
  ],
  bookshelfCard: [
    { label: '卡片背景', varName: '--card' },
    { label: '卡片文字', varName: '--card-foreground' },
  ],
  button: [
    { label: '按钮背景', varName: '--primary' },
    { label: '按钮文字', varName: '--primary-foreground' },
  ],
  dialog: [
    { label: '对话框背景', varName: '--popover' },
    { label: '对话框文字', varName: '--popover-foreground' },
  ],
  sidebarHeader: [{ label: '上部背景', varName: '--sidebar' }],
  sidebarFooter: [{ label: '底部背景', varName: '--sidebar' }],
  settingsCard: [
    { label: '卡片背景', varName: '--card' },
    { label: '卡片文字', varName: '--card-foreground' },
  ],
  settingsTabPanel: [
    { label: '面板背景', varName: '--background' },
    { label: '面板文字', varName: '--foreground' },
  ],
  recordCard: [
    { label: '卡片背景', varName: '--card' },
    { label: '卡片文字', varName: '--card-foreground' },
  ],
  surfaceCard: [
    { label: '卡片背景', varName: '--card' },
    { label: '卡片文字', varName: '--card-foreground' },
  ],
  dropdown: [
    { label: '菜单背景', varName: '--popover' },
    { label: '菜单文字', varName: '--popover-foreground' },
  ],
  drawer: [
    { label: '抽屉背景', varName: '--background' },
    { label: '抽屉文字', varName: '--foreground' },
  ],
  toast: [
    { label: 'Toast 背景', varName: '--background' },
    { label: 'Toast 文字', varName: '--foreground' },
  ],
  appShell: [
    { label: '壳层背景', varName: '--background' },
    { label: '壳层文字', varName: '--foreground' },
  ],
};

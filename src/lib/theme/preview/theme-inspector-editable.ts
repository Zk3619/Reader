/**
 * 根据组件 registry editablePaths 决定 Inspector 展示哪些编辑项
 */

import type { ThemeComponentDescriptor } from '@/lib/theme/preview/component-registry';
import {
  SEMANTIC_TOKEN_GROUPS,
  type SemanticTokenGroup,
} from '@/lib/theme/theme-semantic-colors';
import {
  LAYOUT_SIZE_TOKEN_GROUPS,
  MOTION_TOKEN_GROUPS,
  type LayoutTokenGroup,
} from '@/lib/theme/theme-layout-tokens';
import { isLayoutMotionToken, isLayoutSizeToken } from '@/lib/theme/preview/theme-layout-token-meta';
import type { SemanticColorTokens, LayoutTokens } from '@/lib/theme/types';
import type { ThemeApplyScope } from '@/lib/theme/schema/theme-pack-v1';

export interface InspectorEditableSections {
  semanticGroups: SemanticTokenGroup[];
  layoutGroups: LayoutTokenGroup[];
  motionGroups: LayoutTokenGroup[];
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
  showViewerPageTipSurface: boolean;
  showViewerBrightnessSurface: boolean;
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
  if (keys === 'all') return LAYOUT_SIZE_TOKEN_GROUPS;
  if (keys.size === 0) return [];
  return LAYOUT_SIZE_TOKEN_GROUPS
    .map((group) => ({
      ...group,
      keys: group.keys.filter((key) => keys.has(key) && isLayoutSizeToken(key)),
    }))
    .filter((group) => group.keys.length > 0);
}

function filterMotionGroups(keys: Set<keyof LayoutTokens> | 'all'): LayoutTokenGroup[] {
  const source = MOTION_TOKEN_GROUPS;
  if (keys === 'all') return source;
  if (keys.size === 0) return [];
  return source
    .map((group) => ({
      ...group,
      keys: group.keys.filter((key) => keys.has(key) && isLayoutMotionToken(key)),
    }))
    .filter((group) => group.keys.length > 0);
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
  const showViewerPageTipSurface = paths.some((p) => p.includes('surfaceAppearance.pageTip'));
  const showViewerBrightnessSurface = paths.some((p) => p.includes('surfaceAppearance.brightness'));

  return {
    semanticGroups: filterSemanticGroups(semanticKeys),
    layoutGroups: filterLayoutGroups(parseLayoutKeys(paths)),
    motionGroups: filterMotionGroups(parseLayoutKeys(paths)),
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
      !showViewerChromeSurface &&
      !showViewerPageTipSurface &&
      !showViewerBrightnessSurface,
    showViewerChromeSurface,
    showViewerPageTipSurface,
    showViewerBrightnessSurface,
  };
}

export {
  filterComponentCssVarPresets,
  getComponentCssVarPresetHint,
  getComponentCssVarPresets,
  type ComponentCssVarPreset,
} from '@/lib/theme/preview/theme-component-text-roles';

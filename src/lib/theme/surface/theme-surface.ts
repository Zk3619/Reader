/**
 * Surface 编辑层抽象 — 序列化仍拆回 v1 的 colors/cssVars + surfaceAppearance + background
 */

import type { TextViewerSurfaceKind } from '@/lib/theme/text-viewer-surface-appearance';
import { COMPONENT_SURFACE_BG_VAR } from '@/lib/theme/component-surface-appearance';
import type {
  ComponentStyleOverride,
  ContainerBackgroundConfig,
  ReaderThemePackV1,
  ThemeComponentId,
} from '@/lib/theme/schema/theme-pack-v1';
import type { SemanticColorTokens } from '@/lib/theme/types';
import {
  normalizeViewerChromeOverlayBlurPx,
  normalizeViewerChromeOverlayOpacity,
} from '@/lib/viewer/media-viewer-chrome-overlay-appearance';
import { TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT } from '@/lib/theme/text-viewer-surface-appearance';
import { getThemeComponentBackground } from '@/lib/theme/component-background';
import { isAppComponentId } from '@/lib/theme/preview/component-registry';

export type ThemeSurfaceColorRef =
  | { type: 'semantic'; token: keyof SemanticColorTokens }
  | { type: 'cssVar'; name: string }
  | { type: 'literal'; hex: string };

export interface ThemeSurface {
  colorRef: ThemeSurfaceColorRef;
  opacity: number;
  blurPx: number;
  decoration?: ContainerBackgroundConfig;
}

export type ThemeSurfaceTarget =
  | { kind: 'component'; componentId: ThemeComponentId }
  | { kind: 'textViewer'; surfaceKind: TextViewerSurfaceKind };

const CSS_VAR_TO_SEMANTIC: Record<string, keyof SemanticColorTokens> = {
  '--background': 'background',
  '--foreground': 'foreground',
  '--card': 'card',
  '--card-foreground': 'cardForeground',
  '--popover': 'popover',
  '--popover-foreground': 'popoverForeground',
  '--primary': 'primary',
  '--primary-foreground': 'primaryForeground',
  '--secondary': 'secondary',
  '--secondary-foreground': 'secondaryForeground',
  '--accent': 'accent',
  '--accent-foreground': 'accentForeground',
  '--muted': 'muted',
  '--muted-foreground': 'mutedForeground',
  '--sidebar': 'sidebar',
  '--sidebar-foreground': 'sidebarForeground',
};

function normalizeSurfaceAppearance(partial?: { opacity?: number; blurPx?: number }) {
  return {
    opacity: normalizeViewerChromeOverlayOpacity(
      partial?.opacity ?? TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT.opacity,
    ),
    blurPx: normalizeViewerChromeOverlayBlurPx(
      partial?.blurPx ?? TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT.blurPx,
    ),
  };
}

function colorRefFromCssVar(varName: string): ThemeSurfaceColorRef {
  const token = CSS_VAR_TO_SEMANTIC[varName];
  if (token) return { type: 'semantic', token };
  return { type: 'cssVar', name: varName };
}

export function defaultColorRefForComponent(componentId: ThemeComponentId): ThemeSurfaceColorRef {
  const bgVar = COMPONENT_SURFACE_BG_VAR[componentId] ?? '--background';
  return colorRefFromCssVar(bgVar);
}

function readComponentOverride(
  pack: ReaderThemePackV1,
  componentId: ThemeComponentId,
): ComponentStyleOverride | undefined {
  if (isAppComponentId(componentId)) {
    return pack.app?.components?.[componentId];
  }
  return pack.viewer?.components?.[componentId];
}

export function surfaceFromComponentOverride(
  componentId: ThemeComponentId,
  override: ComponentStyleOverride | undefined,
  colorMode: 'light' | 'dark',
): ThemeSurface {
  const appearance = normalizeSurfaceAppearance(override?.surfaceAppearance);
  const bgVar = COMPONENT_SURFACE_BG_VAR[componentId] ?? '--background';
  const semanticToken = CSS_VAR_TO_SEMANTIC[bgVar];

  if (semanticToken && override?.colors?.[semanticToken]) {
    return {
      colorRef: { type: 'semantic', token: semanticToken },
      opacity: appearance.opacity,
      blurPx: appearance.blurPx,
      decoration: override.background,
    };
  }

  const cssVal = override?.cssVars?.[bgVar];
  if (cssVal) {
    return {
      colorRef: { type: 'cssVar', name: bgVar },
      opacity: appearance.opacity,
      blurPx: appearance.blurPx,
      decoration: override.background,
    };
  }

  if (semanticToken) {
    return {
      colorRef: { type: 'semantic', token: semanticToken },
      opacity: appearance.opacity,
      blurPx: appearance.blurPx,
      decoration: override?.background,
    };
  }

  void colorMode;
  return {
    colorRef: colorRefFromCssVar(bgVar),
    opacity: appearance.opacity,
    blurPx: appearance.blurPx,
    decoration: override?.background,
  };
}

export function surfaceFromPack(
  pack: ReaderThemePackV1,
  target: ThemeSurfaceTarget,
  colorMode: 'light' | 'dark',
): ThemeSurface {
  if (target.kind === 'component') {
    return surfaceFromComponentOverride(
      target.componentId,
      readComponentOverride(pack, target.componentId),
      colorMode,
    );
  }
  return surfaceFromTextViewerKind(target.surfaceKind, pack);
}

export function surfaceFromTextViewerKind(
  kind: TextViewerSurfaceKind,
  pack: ReaderThemePackV1,
): ThemeSurface {
  const partial = pack.viewer?.text?.surfaceAppearance?.[kind];
  const appearance = normalizeSurfaceAppearance(partial);
  const decoration =
    kind === 'content' ? pack.viewer?.text?.contentBackground : undefined;

  return {
    colorRef: { type: 'literal', hex: '#f5f0e8' },
    opacity: appearance.opacity,
    blurPx: appearance.blurPx,
    decoration,
  };
}

export function surfaceToComponentOverride(
  surface: ThemeSurface,
  existing: ComponentStyleOverride | undefined,
  colorMode: 'light' | 'dark',
): ComponentStyleOverride {
  const next: ComponentStyleOverride = { ...existing };
  const { opacity, blurPx } = normalizeSurfaceAppearance({
    opacity: surface.opacity,
    blurPx: surface.blurPx,
  });

  if (opacity !== 100 || blurPx > 0) {
    next.surfaceAppearance = { opacity, blurPx };
  } else {
    delete next.surfaceAppearance;
  }

  if (surface.decoration?.type === 'none') {
    delete next.background;
  } else if (surface.decoration) {
    next.background = surface.decoration;
  }

  if (surface.colorRef.type === 'semantic') {
    const token = surface.colorRef.token;
    next.colors = { ...next.colors, [token]: next.colors?.[token] };
    void colorMode;
  } else if (surface.colorRef.type === 'cssVar') {
    next.cssVars = { ...next.cssVars, [surface.colorRef.name]: next.cssVars?.[surface.colorRef.name] ?? '' };
  }

  return next;
}

export function surfaceToTextViewerKind(
  kind: TextViewerSurfaceKind,
  surface: ThemeSurface,
  pack: ReaderThemePackV1,
): ReaderThemePackV1 {
  const { opacity, blurPx } = normalizeSurfaceAppearance({
    opacity: surface.opacity,
    blurPx: surface.blurPx,
  });

  const surfacePatch =
    opacity !== 100 || blurPx > 0 ? { opacity, blurPx } : undefined;

  let next: ReaderThemePackV1 = {
    ...pack,
    viewer: {
      ...pack.viewer,
      text: {
        ...pack.viewer?.text,
        surfaceAppearance: {
          ...pack.viewer?.text?.surfaceAppearance,
          [kind]: surfacePatch,
        },
      },
    },
  };

  if (kind === 'content' && surface.decoration) {
    const contentBackground =
      surface.decoration.type === 'none' ? undefined : surface.decoration;
    next = {
      ...next,
      viewer: {
        ...next.viewer,
        text: {
          ...next.viewer?.text,
          contentBackground,
        },
      },
    };
  }

  return next;
}

export function patchPackSurface(
  pack: ReaderThemePackV1,
  target: ThemeSurfaceTarget,
  patch: Partial<Pick<ThemeSurface, 'opacity' | 'blurPx' | 'decoration'>>,
  colorMode: 'light' | 'dark',
): ReaderThemePackV1 {
  const current = surfaceFromPack(pack, target, colorMode);
  const merged: ThemeSurface = { ...current, ...patch };

  if (target.kind === 'component') {
    const id = target.componentId;
    const existing = readComponentOverride(pack, id);
    const override = surfaceToComponentOverride(merged, existing, colorMode);

    if (patch.opacity !== undefined || patch.blurPx !== undefined) {
      const { opacity, blurPx } = normalizeSurfaceAppearance({
        opacity: merged.opacity,
        blurPx: merged.blurPx,
      });
      override.surfaceAppearance =
        opacity !== 100 || blurPx > 0 ? { opacity, blurPx } : undefined;
    }

    if (isAppComponentId(id)) {
      return {
        ...pack,
        app: {
          ...pack.app!,
          components: {
            ...pack.app?.components,
            [id]: { ...pack.app?.components?.[id], ...override },
          },
        },
      };
    }
    return {
      ...pack,
      viewer: {
        ...pack.viewer,
        components: {
          ...pack.viewer?.components,
          [id]: { ...pack.viewer?.components?.[id], ...override },
        },
      },
    };
  }

  return surfaceToTextViewerKind(target.surfaceKind, merged, pack);
}

export function readDecorationForTarget(
  pack: ReaderThemePackV1,
  target: ThemeSurfaceTarget,
): ContainerBackgroundConfig | undefined {
  if (target.kind === 'textViewer' && target.surfaceKind === 'content') {
    return pack.viewer?.text?.contentBackground;
  }
  if (target.kind === 'component') {
    return getThemeComponentBackground(pack, target.componentId);
  }
  return undefined;
}

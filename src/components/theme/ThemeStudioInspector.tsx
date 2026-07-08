/**
 * Theme Studio Inspector — 语义色 / 背景 / 特效 / 高级（CodeMirror）
 */

import { For, Show, createMemo } from 'solid-js';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  ComponentLayoutOverride,
  ComponentTypographyOverride,
  CustomCssBlock,
  CustomCursorEffect,
  ReaderThemePackV1,
  ThemeComponentId,
  ThemeEffectConfig,
  TsParticlesPreset,
} from '@/lib/theme/schema/theme-pack-v1';
import { getThemeComponent, isAppComponentId } from '@/lib/theme/preview/component-registry';
import { themeStudioStore } from '@/stores/theme-studio';
import { ThemeCodeEditor } from '@/components/theme/ThemeCodeEditor';
import {
  SEMANTIC_TOKEN_LABELS,
  hexToHslComponents,
  hslComponentsToHex,
} from '@/lib/theme/theme-semantic-colors';
import type { SemanticColorTokens } from '@/lib/theme/types';
import { writeThemeAssetFile } from '@/lib/theme/theme-asset-storage';
import { createThemePackId } from '@/lib/theme/schema/theme-pack-v1';
import {
  LAYOUT_TOKEN_LABELS,
  DEFAULT_LAYOUT_TOKEN_VALUES,
} from '@/lib/theme/theme-layout-tokens';
import type { LayoutTokens } from '@/lib/theme/types';
import { cn } from '@/lib/utils';
import { TsParticlesOptionsPanel } from '@/components/theme/TsParticlesOptionsPanel';
import {
  layoutTokenRulerWidthPx,
  validateLayoutToken,
} from '@/lib/theme/layout-token-validation';
import {
  BackgroundOpacityBlurFields,
  ComponentBackgroundControls,
  patchComponentBackgroundAsset,
  patchViewerTextContentBackgroundAsset,
} from '@/components/theme/ComponentBackgroundControls';
import {
  COMPONENT_CSS_VAR_PRESETS,
  filterComponentCssVarPresets,
  resolveInspectorEditableSections,
} from '@/lib/theme/preview/theme-inspector-editable';

export interface ThemeStudioInspectorProps {
  selectedComponentId: ThemeComponentId;
}

const TEXT_VIEWER_PALETTE_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
const COMPONENT_LAYOUT_LABELS: Record<keyof ComponentLayoutOverride, string> = {
  padding: '内边距',
  margin: '外边距',
  gap: '间距',
  radius: '圆角',
  border: '边框',
  shadow: '阴影',
};

const PARTICLE_PRESETS: TsParticlesPreset[] = [
  'particles',
  'stars',
  'snow',
  'firefly',
  'links',
  'bubbles',
  'aurora',
];

const COMPONENT_TYPOGRAPHY_LABELS: Record<keyof ComponentTypographyOverride, string> = {
  fontSize: '字号',
  fontWeight: '字重',
  lineHeight: '行高',
  letterSpacing: '字距',
  fontFamily: '字体',
};

function defaultMouseTrailEffect(): ThemeEffectConfig {
  return {
    type: 'mouseTrail',
    enabled: true,
    color: 'rgba(8, 145, 178, 0.55)',
    length: 24,
    size: 6,
    fadeMs: 420,
    scope: 'readerContent',
  };
}

function defaultClickParticlesEffect(): ThemeEffectConfig {
  return {
    type: 'clickParticles',
    enabled: true,
    count: 20,
    colors: ['#0891b2', '#22d3ee', '#059669'],
    scope: 'app',
  };
}

function defaultClickRippleEffect(): ThemeEffectConfig {
  return {
    type: 'clickRipple',
    enabled: true,
    color: 'rgba(8, 145, 178, 0.35)',
    durationMs: 600,
    maxSize: 100,
    scope: 'app',
  };
}

function defaultCustomCursorEffect(): ThemeEffectConfig {
  return {
    type: 'customCursor',
    enabled: true,
    mode: 'ring',
    innerSize: 8,
    outerSize: 36,
    innerColor: '#0891b2',
    outerColor: 'rgba(8, 145, 178, 0.45)',
    hideDefault: true,
    scope: 'app',
  };
}

function defaultCustomCursorImageEffect(): ThemeEffectConfig {
  return {
    type: 'customCursor',
    enabled: true,
    mode: 'image',
    width: 32,
    height: 32,
    hideDefault: true,
    scope: 'app',
  };
}

export function ThemeStudioInspector(props: ThemeStudioInspectorProps) {
  const descriptor = () => getThemeComponent(props.selectedComponentId);
  const colorMode = () => themeStudioStore.state.colorMode;
  const semanticMode = (): 'light' | 'dark' => colorMode();
  const sections = createMemo(() =>
    resolveInspectorEditableSections(
      descriptor(),
      semanticMode(),
      themeStudioStore.state.scope,
    ),
  );

  const patchPack = (updater: (draft: ReaderThemePackV1) => ReaderThemePackV1) => {
    themeStudioStore.patchDraft(updater);
  };

  const effects = () => themeStudioStore.state.draftPack.advanced?.effects ?? [];

  const toggleEffect = (factory: () => ThemeEffectConfig) => {
    patchPack((draft) => {
      const list = [...(draft.advanced?.effects ?? [])];
      const type = factory().type;
      const idx = list.findIndex((e) => e.type === type);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(factory());
      return { ...draft, advanced: { ...draft.advanced, effects: list } };
    });
  };

  const patchSemantic = (key: keyof SemanticColorTokens, hex: string) => {
    const hsl = hexToHslComponents(hex);
    patchPack((draft) => {
      const mode = semanticMode();
      const tokens = draft.app?.tokens;
      if (!tokens) return draft;
      return {
        ...draft,
        app: {
          ...draft.app!,
          tokens: {
            ...tokens,
            [mode]: { ...tokens[mode], [key]: hsl },
          },
        },
      };
    });
  };

  const semanticValue = (key: keyof SemanticColorTokens): string => {
    const tokens = themeStudioStore.state.draftPack.app?.tokens;
    if (!tokens) return '#888888';
    return hslComponentsToHex(tokens[semanticMode()][key]);
  };

  const customCursorEffect = (): Extract<ThemeEffectConfig, { type: 'customCursor' }> | undefined =>
    effects().find((e): e is Extract<ThemeEffectConfig, { type: 'customCursor' }> => e.type === 'customCursor');

  const patchCustomCursor = (
    patch: Partial<Extract<ThemeEffectConfig, { type: 'customCursor' }>>,
  ) => {
    patchPack((draft) => {
      const list = [...(draft.advanced?.effects ?? [])];
      const idx = list.findIndex((e) => e.type === 'customCursor');
      if (idx < 0) {
        const base = defaultCustomCursorImageEffect() as CustomCursorEffect;
        const next: CustomCursorEffect = {
          ...base,
          ...patch,
          type: 'customCursor',
          mode: patch.mode ?? base.mode,
        };
        list.push(next);
      } else {
        list[idx] = { ...(list[idx] as Extract<ThemeEffectConfig, { type: 'customCursor' }>), ...patch };
      }
      return { ...draft, advanced: { ...draft.advanced, effects: list } };
    });
  };

  const setCustomCursorMode = (mode: 'ring' | 'image') => {
    patchPack((draft) => {
      const list = [...(draft.advanced?.effects ?? [])];
      const idx = list.findIndex((e) => e.type === 'customCursor');
      const factory = mode === 'ring' ? defaultCustomCursorEffect : defaultCustomCursorImageEffect;
      if (idx >= 0) {
        const current = list[idx] as Extract<ThemeEffectConfig, { type: 'customCursor' }>;
        if (current.mode === mode) {
          list.splice(idx, 1);
        } else {
          list[idx] = factory();
        }
      } else {
        list.push(factory());
      }
      return { ...draft, advanced: { ...draft.advanced, effects: list } };
    });
  };

  const uploadCursorAsset = (
    slot: 'assetId' | 'hoverAssetId' | 'activeAssetId',
    label: string,
  ) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.svg,.cur,.png,.webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const pack = themeStudioStore.state.draftPack;
      const assetId = `cursor-${slot.replace('AssetId', '')}-${createThemePackId().slice(0, 6)}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      await writeThemeAssetFile(pack.id, file.name, bytes);
      patchPack((d) => {
        const list = [...(d.advanced?.effects ?? [])];
        let idx = list.findIndex((e) => e.type === 'customCursor');
        if (idx < 0) {
          list.push(defaultCustomCursorImageEffect());
          idx = list.length - 1;
        }
        const cur = list[idx] as Extract<ThemeEffectConfig, { type: 'customCursor' }>;
        list[idx] = {
          ...cur,
          mode: 'image',
          enabled: true,
          [slot]: assetId,
        };
        return {
          ...d,
          assets: {
            ...d.assets,
            [assetId]: {
              path: `assets/${file.name}`,
              mime: file.type || 'image/png',
              kind: 'image',
            },
          },
          advanced: { ...d.advanced, effects: list },
        };
      });
      showAppToast({ title: `${label}已上传` });
    };
    input.click();
  };

  const patchLayout = (key: keyof LayoutTokens, value: string) => {
    patchPack((draft) => {
      const tokens = draft.app?.tokens;
      if (!tokens) return draft;
      return {
        ...draft,
        app: {
          ...draft.app!,
          tokens: {
            ...tokens,
            layout: { ...tokens.layout, [key]: value },
          },
        },
      };
    });
  };

  const layoutValue = (key: keyof LayoutTokens): string => {
    const layout = themeStudioStore.state.draftPack.app?.tokens?.layout;
    return layout?.[key] ?? DEFAULT_LAYOUT_TOKEN_VALUES[key];
  };

  const componentOverride = () => {
    const id = props.selectedComponentId;
    if (isAppComponentId(id)) {
      return themeStudioStore.state.draftPack.app?.components?.[id];
    }
    return themeStudioStore.state.draftPack.viewer?.components?.[id];
  };

  const componentLayoutValue = (key: keyof ComponentLayoutOverride): string =>
    componentOverride()?.layout?.[key] ?? '';

  const patchComponentLayout = (key: keyof ComponentLayoutOverride, value: string) => {
    const id = props.selectedComponentId;
    patchPack((draft) => {
      if (isAppComponentId(id)) {
        return {
          ...draft,
          app: {
            ...draft.app!,
            components: {
              ...draft.app?.components,
              [id]: {
                ...draft.app?.components?.[id],
                layout: {
                  ...draft.app?.components?.[id]?.layout,
                  [key]: value || undefined,
                },
              },
            },
          },
        };
      }
      return {
        ...draft,
        viewer: {
          ...draft.viewer,
          components: {
            ...draft.viewer?.components,
            [id]: {
              ...draft.viewer?.components?.[id],
              layout: {
                ...draft.viewer?.components?.[id]?.layout,
                [key]: value || undefined,
              },
            },
          },
        },
      };
    });
  };

  const componentTypographyValue = (key: keyof ComponentTypographyOverride): string => {
    const raw = componentOverride()?.typography?.[key];
    return raw != null ? String(raw) : '';
  };

  const patchComponentTypography = (key: keyof ComponentTypographyOverride, value: string) => {
    const id = props.selectedComponentId;
    patchPack((draft) => {
      const patchTypography = (prev?: ComponentTypographyOverride) => ({
        ...prev,
        [key]: value || undefined,
      });
      if (isAppComponentId(id)) {
        return {
          ...draft,
          app: {
            ...draft.app!,
            components: {
              ...draft.app?.components,
              [id]: {
                ...draft.app?.components?.[id],
                typography: patchTypography(draft.app?.components?.[id]?.typography),
              },
            },
          },
        };
      }
      return {
        ...draft,
        viewer: {
          ...draft.viewer,
          components: {
            ...draft.viewer?.components,
            [id]: {
              ...draft.viewer?.components?.[id],
              typography: patchTypography(draft.viewer?.components?.[id]?.typography),
            },
          },
        },
      };
    });
  };

  const customCssForComponent = (): string => {
    const blocks = themeStudioStore.state.draftPack.advanced?.customCss ?? [];
    return blocks.find((b) => b.componentId === props.selectedComponentId)?.css ?? '';
  };

  const patchCustomCssForComponent = (css: string) => {
    const componentId = props.selectedComponentId;
    const scope = isAppComponentId(componentId) ? 'app' : 'viewer';
    patchPack((draft) => {
      const rest = (draft.advanced?.customCss ?? []).filter((b) => b.componentId !== componentId);
      const trimmed = css.trim();
      const customCss = trimmed
        ? [...rest, { scope, componentId, css: trimmed } satisfies CustomCssBlock]
        : rest;
      return { ...draft, advanced: { ...draft.advanced, customCss } };
    });
  };

  const patchContentSurfaceAppearance = (
    patch: Partial<{ opacity: number; blurPx: number }>,
  ) => {
    patchPack((draft) => ({
      ...draft,
      viewer: {
        ...draft.viewer,
        text: {
          ...draft.viewer?.text,
          surfaceAppearance: {
            ...draft.viewer?.text?.surfaceAppearance,
            content: {
              ...draft.viewer?.text?.surfaceAppearance?.content,
              ...patch,
            },
          },
        },
      },
    }));
  };

  const componentSurfaceAppearance = () => ({
    opacity: componentOverride()?.surfaceAppearance?.opacity ?? 100,
    blurPx: componentOverride()?.surfaceAppearance?.blurPx ?? 0,
  });

  const patchComponentSurfaceAppearance = (
    patch: Partial<{ opacity: number; blurPx: number }>,
  ) => {
    const id = props.selectedComponentId;
    patchPack((draft) => {
      const mergeSurface = (prev?: { opacity?: number; blurPx?: number }) => ({
        ...prev,
        ...patch,
      });
      if (isAppComponentId(id)) {
        return {
          ...draft,
          app: {
            ...draft.app!,
            components: {
              ...draft.app?.components,
              [id]: {
                ...draft.app?.components?.[id],
                surfaceAppearance: mergeSurface(draft.app?.components?.[id]?.surfaceAppearance),
              },
            },
          },
        };
      }
      return {
        ...draft,
        viewer: {
          ...draft.viewer,
          components: {
            ...draft.viewer?.components,
            [id]: {
              ...draft.viewer?.components?.[id],
              surfaceAppearance: mergeSurface(draft.viewer?.components?.[id]?.surfaceAppearance),
            },
          },
        },
      };
    });
  };

  const chromeSurfaceAppearance = () => ({
    opacity: themeStudioStore.state.draftPack.viewer?.text?.surfaceAppearance?.chrome?.opacity ?? 100,
    blurPx: themeStudioStore.state.draftPack.viewer?.text?.surfaceAppearance?.chrome?.blurPx ?? 0,
  });

  const patchChromeSurfaceAppearance = (
    patch: Partial<{ opacity: number; blurPx: number }>,
  ) => {
    patchPack((draft) => ({
      ...draft,
      viewer: {
        ...draft.viewer,
        text: {
          ...draft.viewer?.text,
          surfaceAppearance: {
            ...draft.viewer?.text?.surfaceAppearance,
            chrome: {
              ...draft.viewer?.text?.surfaceAppearance?.chrome,
              ...patch,
            },
          },
        },
      },
    }));
  };

  const contentSurfaceAppearance = () => ({
    opacity: themeStudioStore.state.draftPack.viewer?.text?.surfaceAppearance?.content?.opacity ?? 100,
    blurPx: themeStudioStore.state.draftPack.viewer?.text?.surfaceAppearance?.content?.blurPx ?? 0,
  });

  const hasContentDecorBackground = () => {
    const bg = themeStudioStore.state.draftPack.viewer?.text?.contentBackground;
    return bg?.type === 'asset';
  };

  const hasBackgroundControls = () =>
    sections().showComponentSurfaceAppearance ||
    sections().showComponentBackground ||
    sections().showViewerContentBackground ||
    sections().showViewerChromeSurface ||
    sections().showTsParticles;

  const componentCssVarValue = (varName: string): string => {
    const id = props.selectedComponentId;
    let raw = '';
    if (isAppComponentId(id)) {
      raw = themeStudioStore.state.draftPack.app?.components?.[id]?.cssVars?.[varName] ?? '';
    } else {
      raw = themeStudioStore.state.draftPack.viewer?.components?.[id]?.cssVars?.[varName] ?? '';
    }
    if (!raw) {
      const root =
        typeof document !== 'undefined'
          ? (document.querySelector('[data-theme-preview-mode]') as HTMLElement | null)
          : null;
      const fallback =
        root?.style.getPropertyValue(varName) ||
        (root ? getComputedStyle(root).getPropertyValue(varName) : '');
      return fallback ? hslComponentsToHex(fallback.trim()) : '#888888';
    }
    return hslComponentsToHex(raw);
  };

  const patchComponentCssVar = (varName: string, hex: string) => {
    const id = props.selectedComponentId;
    const hsl = hexToHslComponents(hex);
    patchPack((draft) => {
      if (isAppComponentId(id)) {
        return {
          ...draft,
          app: {
            ...draft.app!,
            components: {
              ...draft.app?.components,
              [id]: {
                ...draft.app?.components?.[id],
                cssVars: {
                  ...draft.app?.components?.[id]?.cssVars,
                  [varName]: hsl,
                },
              },
            },
          },
        };
      }
      return {
        ...draft,
        viewer: {
          ...draft.viewer,
          components: {
            ...draft.viewer?.components,
            [id]: {
              ...draft.viewer?.components?.[id],
              cssVars: {
                ...draft.viewer?.components?.[id]?.cssVars,
                [varName]: hsl,
              },
            },
          },
        },
      };
    });
  };

  const cssVarPresets = () =>
    filterComponentCssVarPresets(
      COMPONENT_CSS_VAR_PRESETS[props.selectedComponentId] ?? [],
      sections().semanticGroups,
    );

  const uploadComponentBackground = () => {
    const componentId = props.selectedComponentId;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,.gif';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const pack = themeStudioStore.state.draftPack;
      const assetId = createThemePackId().slice(0, 8);
      const bytes = new Uint8Array(await file.arrayBuffer());
      await writeThemeAssetFile(pack.id, file.name, bytes);
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const kind = ['mp4', 'webm'].includes(ext) ? 'video' : ext === 'gif' ? 'gif' : 'image';

      patchPack((d) =>
        patchComponentBackgroundAsset(
          d,
          componentId,
          assetId,
          file.name,
          file.type || 'application/octet-stream',
          kind,
        ),
      );
      showAppToast({ title: `已设置 ${descriptor()?.label ?? componentId} 背景` });
    };
    input.click();
  };

  const uploadBackgroundAsset = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,.gif';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const pack = themeStudioStore.state.draftPack;
      const assetId = createThemePackId().slice(0, 8);
      const bytes = new Uint8Array(await file.arrayBuffer());
      await writeThemeAssetFile(pack.id, file.name, bytes);
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const kind = (['mp4', 'webm'].includes(ext) ? 'video' : ext === 'gif' ? 'gif' : 'image') as
        | 'video'
        | 'gif'
        | 'image';
      patchPack((d) => {
        const withAssets = {
          ...d,
          assets: {
            ...d.assets,
            [assetId]: { path: `assets/${file.name}`, mime: file.type || 'application/octet-stream', kind },
          },
        };
        return patchViewerTextContentBackgroundAsset(withAssets, {
          assetId,
          fit: 'cover',
          opacity: 90,
          blurPx: 0,
        });
      });
      showAppToast({ title: '背景资产已上传' });
    };
    input.click();
  };

  const toggleParticles = (preset: TsParticlesPreset) => {
    patchPack((draft) => {
      const current = draft.advanced?.threeJs;
      if (current?.enabled && current.preset === preset) {
        return {
          ...draft,
          advanced: { ...draft.advanced, threeJs: { ...current, enabled: false } },
        };
      }
      return {
        ...draft,
        advanced: {
          ...draft.advanced,
          threeJs: { preset, enabled: true, scope: 'readerBackground' },
        },
      };
    });
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="shrink-0 border-b border-border px-4 py-3">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">选中组件</p>
        <p class="text-sm font-semibold text-foreground">{descriptor()?.label ?? props.selectedComponentId}</p>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto scroll-gutter-stable-both p-4">
      <Tabs defaultValue="colors" class="w-full">
        <TabsList class="grid w-full grid-cols-4">
          <TabsTrigger value="colors">颜色</TabsTrigger>
          <TabsTrigger value="background">背景</TabsTrigger>
          <TabsTrigger value="effects">特效</TabsTrigger>
          <TabsTrigger value="advanced">高级</TabsTrigger>
        </TabsList>

        <TabsContent value="colors" class="space-y-3 pt-3">
          <TextField>
            <TextFieldLabel>主题名称</TextFieldLabel>
            <TextFieldInput
              value={themeStudioStore.state.draftPack.name}
              onInput={(e) => patchPack((d) => ({ ...d, name: e.currentTarget.value }))}
            />
          </TextField>

          <p class="text-xs text-muted-foreground">
            编辑 {semanticMode() === 'light' ? '浅色' : '深色'} 语义色（预览区当前模式）
          </p>

          <Show when={sections().semanticGroups.length === 0 && cssVarPresets().length === 0}>
            <p class="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
              当前组件无可编辑的全局语义色。组件底色请通过下方 CSS 变量（若可用）调节；装饰图/模糊请在「背景」标签页设置。
            </p>
          </Show>

          <For each={sections().semanticGroups}>
            {(group) => (
              <div class="space-y-2 rounded-lg border border-border/50 p-2">
                <p class="text-xs font-medium text-foreground">{group.label}</p>
                <For each={group.keys}>
                  {(key) => (
                    <div class="flex items-center gap-2">
                      <input
                        type="color"
                        class="h-8 w-10 shrink-0 cursor-pointer rounded border border-input p-0.5"
                        value={semanticValue(key)}
                        aria-label={SEMANTIC_TOKEN_LABELS[key]}
                        title={SEMANTIC_TOKEN_LABELS[key]}
                        onInput={(e) => patchSemantic(key, e.currentTarget.value)}
                      />
                      <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {SEMANTIC_TOKEN_LABELS[key]}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>

          <Show when={sections().showComponentOverride && cssVarPresets().length > 0}>
            <div class="space-y-2 rounded-lg border border-border/50 p-2">
              <p class="text-xs font-medium text-foreground">组件 CSS 变量</p>
              <p class="text-[11px] text-muted-foreground">
                仅作用于当前组件。背景色若已在上方语义色中出现，请优先用语义色；此处保留文字/强调/边框等局部覆盖。
              </p>
              <For each={cssVarPresets()}>
                {(preset) => (
                  <div class="flex items-center gap-2">
                    <input
                      type="color"
                      class="h-8 w-10 shrink-0 cursor-pointer rounded border border-input p-0.5"
                      value={componentCssVarValue(preset.varName)}
                      aria-label={preset.label}
                      title={preset.label}
                      onInput={(e) => patchComponentCssVar(preset.varName, e.currentTarget.value)}
                    />
                    <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {preset.label}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={sections().showComponentOverride}>
            <div class="space-y-2 rounded-lg border border-border/50 p-2">
              <p class="text-xs font-medium text-foreground">组件布局</p>
              <p class="text-[11px] text-muted-foreground">边框示例：1px solid var(--border)；阴影示例：0 4px 12px rgba(0,0,0,0.12)</p>
              <For each={(['padding', 'margin', 'gap', 'radius', 'border', 'shadow'] as const)}>
                {(key) => (
                  <TextField>
                    <TextFieldLabel class="text-xs">{COMPONENT_LAYOUT_LABELS[key]}</TextFieldLabel>
                    <TextFieldInput
                      value={componentLayoutValue(key)}
                      placeholder="inherit"
                      onInput={(e) => patchComponentLayout(key, e.currentTarget.value)}
                    />
                  </TextField>
                )}
              </For>
            </div>
            <div class="space-y-2 rounded-lg border border-border/50 p-2">
              <p class="text-xs font-medium text-foreground">组件排版</p>
              <For each={(['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'fontFamily'] as const)}>
                {(key) => (
                  <TextField>
                    <TextFieldLabel class="text-xs">{COMPONENT_TYPOGRAPHY_LABELS[key]}</TextFieldLabel>
                    <TextFieldInput
                      value={componentTypographyValue(key)}
                      placeholder="inherit"
                      onInput={(e) => patchComponentTypography(key, e.currentTarget.value)}
                    />
                  </TextField>
                )}
              </For>
            </div>
          </Show>

          <Show when={sections().showViewerPalette}>
          <div class="border-t border-border pt-3">
            <p class="mb-1 text-xs font-medium text-muted-foreground">阅读配色</p>
            <p class="mb-2 text-[11px] text-muted-foreground">决定正文区底色与文字色；透明度/模糊请在「背景」Tab 调整。</p>
            <div class="flex flex-wrap gap-2">
              <For each={TEXT_VIEWER_PALETTE_IDS}>
                {(id) => (
                  <Button
                    size="sm"
                    variant={
                      themeStudioStore.state.draftPack.viewer?.text?.paletteId === id
                        ? 'default'
                        : 'outline'
                    }
                    class="cursor-pointer"
                    onClick={() =>
                      patchPack((d) => ({
                        ...d,
                        viewer: { ...d.viewer, text: { ...d.viewer?.text, paletteId: id } },
                      }))
                    }
                  >
                    {id}
                  </Button>
                )}
              </For>
            </div>
          </div>
          </Show>

          <Show when={sections().layoutGroups.length > 0}>
          <div class="border-t border-border pt-3">
            <p class="mb-2 text-xs font-medium text-muted-foreground">布局 Token</p>
            <For each={sections().layoutGroups}>
              {(group) => (
                <div class="mb-3 space-y-2 rounded-lg border border-border/50 p-2">
                  <p class="text-xs font-medium text-foreground">{group.label}</p>
                  <For each={group.keys}>
                    {(key) => {
                    const value = () => layoutValue(key);
                    const validation = () => validateLayoutToken(key, value());
                    const rulerPx = () => layoutTokenRulerWidthPx(key, value());
                    return (
                      <TextField>
                        <TextFieldLabel class="text-xs">{LAYOUT_TOKEN_LABELS[key]}</TextFieldLabel>
                        <TextFieldInput
                          value={value()}
                          class={validation().valid ? '' : 'border-destructive'}
                          onInput={(e) => patchLayout(key, e.currentTarget.value)}
                        />
                        <Show when={validation().hint}>
                          <p
                            class={cn(
                              'text-xs',
                              validation().valid ? 'text-muted-foreground' : 'text-destructive',
                            )}
                          >
                            {validation().hint}
                          </p>
                        </Show>
                        <Show when={rulerPx()}>
                          {(px) => (
                            <div class="mt-1 flex items-center gap-2">
                              <div
                                class="h-2 rounded-sm bg-primary/60"
                                style={{ width: `${px()}px` }}
                              />
                              <span class="text-[10px] text-muted-foreground">{px()}px</span>
                            </div>
                          )}
                        </Show>
                      </TextField>
                    );
                  }}
                  </For>
                </div>
              )}
            </For>
          </div>
          </Show>

          <Show when={sections().showTypography}>
            <div class="border-t border-border pt-3">
              <p class="mb-2 text-xs font-medium text-muted-foreground">排版</p>
              <TextField>
                <TextFieldLabel class="text-xs">字体族</TextFieldLabel>
                <TextFieldInput
                  value={themeStudioStore.state.draftPack.app?.typography?.fontFamily ?? ''}
                  onInput={(e) =>
                    patchPack((d) => ({
                      ...d,
                      app: {
                        ...d.app!,
                        typography: { ...d.app?.typography, fontFamily: e.currentTarget.value },
                      },
                    }))
                  }
                />
              </TextField>
            </div>
          </Show>

          <Show when={sections().showMotion}>
            <div class="border-t border-border pt-3">
              <p class="mb-2 text-xs font-medium text-muted-foreground">动效 Token</p>
              <TextField>
                <TextFieldLabel class="text-xs">默认过渡时长</TextFieldLabel>
                <TextFieldInput
                  value={themeStudioStore.state.draftPack.app?.motion?.durationNormal ?? ''}
                  placeholder="200ms"
                  onInput={(e) =>
                    patchPack((d) => ({
                      ...d,
                      app: {
                        ...d.app!,
                        motion: { ...d.app?.motion, durationNormal: e.currentTarget.value },
                      },
                    }))
                  }
                />
              </TextField>
            </div>
          </Show>
        </TabsContent>

        <TabsContent value="background" class="space-y-3 pt-3">
          <Show when={!hasBackgroundControls()}>
            <p class="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
              当前组件无可编辑背景项。请选择侧栏、正文区、顶栏等组件，或切换到「全部」作用域。
            </p>
          </Show>

          <Show when={sections().showComponentSurfaceAppearance}>
          <div class="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p class="mb-1 text-xs font-medium text-foreground">底色效果</p>
            <p class="mb-2 text-[11px] text-muted-foreground">
              调节「颜色」Tab 所设底色的不透明度与模糊（{descriptor()?.label ?? props.selectedComponentId}）。
            </p>
            <BackgroundOpacityBlurFields
              opacity={componentSurfaceAppearance().opacity}
              blurPx={componentSurfaceAppearance().blurPx}
              opacityLabel="底色不透明度"
              onOpacityChange={(opacity) => patchComponentSurfaceAppearance({ opacity })}
              onBlurChange={(blurPx) => patchComponentSurfaceAppearance({ blurPx })}
            />
          </div>
          </Show>

          <Show when={sections().showViewerChromeSurface}>
          <div class="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p class="mb-1 text-xs font-medium text-foreground">Chrome 底色效果</p>
            <p class="mb-2 text-[11px] text-muted-foreground">
              阅读器顶栏/底栏等 Chrome 区域的透明度与背景模糊。
            </p>
            <BackgroundOpacityBlurFields
              opacity={chromeSurfaceAppearance().opacity}
              blurPx={chromeSurfaceAppearance().blurPx}
              opacityLabel="Chrome 不透明度"
              onOpacityChange={(opacity) => patchChromeSurfaceAppearance({ opacity })}
              onBlurChange={(blurPx) => patchChromeSurfaceAppearance({ blurPx })}
            />
          </div>
          </Show>

          <Show when={sections().showComponentBackground}>
          <div class="rounded-lg border border-border/50 p-3">
            <p class="mb-1 text-xs font-medium text-muted-foreground">
              装饰背景 · {descriptor()?.label ?? props.selectedComponentId}
            </p>
            <p class="mb-2 text-[11px] text-muted-foreground">
              叠加图片/视频/动图，不改变「颜色」Tab 中的底色 Token。
            </p>
            <Button variant="outline" class="mb-2 w-full cursor-pointer" onClick={uploadComponentBackground}>
              上传装饰图 / 视频
            </Button>
            <ComponentBackgroundControls
              pack={themeStudioStore.state.draftPack}
              componentId={props.selectedComponentId}
              onPatch={patchPack}
            />
          </div>
          </Show>

          <Show when={sections().showViewerContentBackground}>
          <div class="rounded-lg border border-border/50 p-3 space-y-3">
            <div>
              <p class="mb-1 text-xs font-medium text-muted-foreground">正文区装饰背景</p>
              <p class="mb-2 text-[11px] text-muted-foreground">
                正文底色由「颜色」Tab 的阅读配色决定；此处可叠加全屏装饰图。
              </p>
              <Button variant="outline" class="w-full cursor-pointer" onClick={uploadBackgroundAsset}>
                上传正文装饰图 / 动图 / 视频
              </Button>
            </div>
            <Show when={hasContentDecorBackground()}>
              <ComponentBackgroundControls
                pack={themeStudioStore.state.draftPack}
                viewerTextContent
                onPatch={patchPack}
              />
            </Show>
            <div class="border-t border-border/50 pt-3">
              <p class="mb-1 text-xs font-medium text-foreground">正文底色效果</p>
              <p class="mb-2 text-[11px] text-muted-foreground">作用于阅读配色底色（非装饰图图层）。</p>
              <BackgroundOpacityBlurFields
                opacity={contentSurfaceAppearance().opacity}
                blurPx={contentSurfaceAppearance().blurPx}
                opacityLabel="底色不透明度"
                onOpacityChange={(opacity) => patchContentSurfaceAppearance({ opacity })}
                onBlurChange={(blurPx) => patchContentSurfaceAppearance({ blurPx })}
              />
            </div>
          </div>
          </Show>

          <Show when={sections().showViewerChrome && !sections().showViewerChromeSurface}>
          <TextField>
            <TextFieldLabel>Chrome 透明度 (0–100)</TextFieldLabel>
            <TextFieldInput
              type="number"
              min={0}
              max={100}
              value={String(chromeSurfaceAppearance().opacity)}
              onInput={(e) => {
                const opacity = Math.min(100, Math.max(0, Number(e.currentTarget.value) || 0));
                patchChromeSurfaceAppearance({ opacity });
              }}
            />
          </TextField>
          </Show>

          <Show when={sections().showTsParticles}>
          <div>
            <p class="mb-2 text-xs font-medium text-muted-foreground">粒子背景层 (tsParticles)</p>
            <div class="flex flex-wrap gap-1">
              <For each={PARTICLE_PRESETS}>
                {(preset) => (
                  <Button
                    size="sm"
                    variant={
                      themeStudioStore.state.draftPack.advanced?.threeJs?.enabled &&
                      themeStudioStore.state.draftPack.advanced?.threeJs?.preset === preset
                        ? 'default'
                        : 'outline'
                    }
                    class="cursor-pointer text-xs"
                    onClick={() => toggleParticles(preset)}
                  >
                    {preset}
                  </Button>
                )}
              </For>
            </div>
          </div>
          </Show>
        </TabsContent>

        <TabsContent value="effects" class="space-y-3 pt-3">
          <p class="text-sm text-muted-foreground">
            容器级：拖尾/光晕/视差。应用主题后全局：点击粒子/涟漪/自定义指针（mouse-animations）。
          </p>
          <div class="flex flex-col gap-2">
            <Button
              variant={effects().some((e) => e.type === 'mouseTrail') ? 'default' : 'outline'}
              class="cursor-pointer justify-start"
              onClick={() => toggleEffect(defaultMouseTrailEffect)}
            >
              鼠标拖尾
            </Button>
            <Button
              variant={effects().some((e) => e.type === 'mouseGlow') ? 'default' : 'outline'}
              class="cursor-pointer justify-start"
              onClick={() => toggleEffect(() => ({ type: 'mouseGlow', enabled: true, radius: 280, color: '8, 145, 178', intensity: 0.35, scope: 'readerContent' }))}
            >
              光标光晕
            </Button>
            <Button
              variant={effects().some((e) => e.type === 'backgroundParallax') ? 'default' : 'outline'}
              class="cursor-pointer justify-start"
              onClick={() =>
                toggleEffect(() => ({
                  type: 'backgroundParallax',
                  enabled: true,
                  maxShiftPx: 12,
                  scope: 'readerBackground',
                }))
              }
            >
              背景视差
            </Button>
            <Button
              variant={effects().some((e) => e.type === 'clickParticles') ? 'default' : 'outline'}
              class="cursor-pointer justify-start"
              onClick={() => toggleEffect(defaultClickParticlesEffect)}
            >
              点击粒子爆发
            </Button>
            <Button
              variant={effects().some((e) => e.type === 'clickRipple') ? 'default' : 'outline'}
              class="cursor-pointer justify-start"
              onClick={() => toggleEffect(defaultClickRippleEffect)}
            >
              点击涟漪
            </Button>
            <Button
              variant={
                customCursorEffect()?.mode === 'ring' ? 'default' : 'outline'
              }
              class="cursor-pointer justify-start"
              onClick={() => setCustomCursorMode('ring')}
            >
              自定义指针（圆环）
            </Button>
            <Button
              variant={
                customCursorEffect()?.mode === 'image' ? 'default' : 'outline'
              }
              class="cursor-pointer justify-start"
              onClick={() => setCustomCursorMode('image')}
            >
              自定义指针（图片）
            </Button>
          </div>

          <Show when={customCursorEffect()?.mode === 'image'}>
            <div class="space-y-2 rounded-lg border border-border/50 p-3">
              <p class="text-xs font-medium text-muted-foreground">指针图片（默认 / 悬停 / 按下）</p>
              <div class="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  class="cursor-pointer justify-start"
                  onClick={() => uploadCursorAsset('assetId', '默认指针')}
                >
                  上传默认指针
                  {customCursorEffect()?.assetId ? ` · ${customCursorEffect()!.assetId}` : ''}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="cursor-pointer justify-start"
                  onClick={() => uploadCursorAsset('hoverAssetId', '悬停指针')}
                >
                  上传悬停指针
                  {customCursorEffect()?.hoverAssetId ? ` · ${customCursorEffect()!.hoverAssetId}` : ''}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="cursor-pointer justify-start"
                  onClick={() => uploadCursorAsset('activeAssetId', '按下指针')}
                >
                  上传按下指针
                  {customCursorEffect()?.activeAssetId ? ` · ${customCursorEffect()!.activeAssetId}` : ''}
                </Button>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <TextField>
                  <TextFieldLabel>宽度 px</TextFieldLabel>
                  <TextFieldInput
                    type="number"
                    min={8}
                    max={128}
                    value={String(customCursorEffect()?.width ?? 32)}
                    onInput={(e) =>
                      patchCustomCursor({ width: Number(e.currentTarget.value) || 32 })
                    }
                  />
                </TextField>
                <TextField>
                  <TextFieldLabel>高度 px</TextFieldLabel>
                  <TextFieldInput
                    type="number"
                    min={8}
                    max={128}
                    value={String(customCursorEffect()?.height ?? 32)}
                    onInput={(e) =>
                      patchCustomCursor({ height: Number(e.currentTarget.value) || 32 })
                    }
                  />
                </TextField>
              </div>
            </div>
          </Show>
        </TabsContent>

        <TabsContent value="advanced" class="space-y-3 pt-3">
          <div>
            <p class="mb-1 text-xs font-medium text-muted-foreground">
              自定义 CSS · {descriptor()?.label ?? props.selectedComponentId}
            </p>
            <p class="mb-2 text-[11px] text-muted-foreground">
              声明块自动作用于当前选中组件。支持 @keyframes 动画（keyframes 全局注入，其余规则限定到该组件）。
            </p>
            <ThemeCodeEditor
              language="css"
              minHeight="140px"
              value={customCssForComponent()}
              onChange={patchCustomCssForComponent}
            />
          </div>
          <div>
            <p class="mb-1 text-xs font-medium text-muted-foreground">自定义 HTML 片段</p>
            <ThemeCodeEditor
              language="html"
              minHeight="120px"
              value={themeStudioStore.state.draftPack.advanced?.customHtml?.[0]?.html ?? ''}
              onChange={(html) =>
                patchPack((d) => ({
                  ...d,
                  advanced: {
                    ...d.advanced,
                    customHtml: html
                      ? [{ mountPoint: 'appShellBackground', html }]
                      : [],
                  },
                }))
              }
            />
          </div>
          <TsParticlesOptionsPanel
            optionsJson={themeStudioStore.state.draftPack.advanced?.threeJs?.optionsJson}
            onChange={(optionsJson) =>
              patchPack((d) => ({
                ...d,
                advanced: {
                  ...d.advanced,
                  threeJs: {
                    preset: d.advanced?.threeJs?.preset ?? 'particles',
                    enabled: d.advanced?.threeJs?.enabled ?? false,
                    ...d.advanced?.threeJs,
                    optionsJson,
                  },
                },
              }))
            }
          />
          <div>
            <p class="mb-1 text-xs font-medium text-muted-foreground">tsParticles options JSON</p>
            <ThemeCodeEditor
              language="json"
              minHeight="100px"
              value={themeStudioStore.state.draftPack.advanced?.threeJs?.optionsJson ?? ''}
              onChange={(optionsJson) =>
                patchPack((d) => ({
                  ...d,
                  advanced: {
                    ...d.advanced,
                    threeJs: {
                      preset: d.advanced?.threeJs?.preset ?? 'particles',
                      enabled: d.advanced?.threeJs?.enabled ?? false,
                      ...d.advanced?.threeJs,
                      optionsJson,
                    },
                  },
                }))
              }
            />
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

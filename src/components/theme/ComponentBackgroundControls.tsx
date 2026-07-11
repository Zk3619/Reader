/**
 * Studio：组件装饰背景 — 图片/视频 + 透明度 / 模糊 / 填充
 * 纯色底色请在 Inspector「颜色」Tab 通过语义色或组件 CSS 变量调节。
 */

import { For, Show, createMemo } from 'solid-js';
import { Button } from '@/components/ui/button';
import { ThemeStudioOpacityBlurFields } from '@/components/theme/ThemeStudioOpacityBlurFields';
import type {
  ContainerBackgroundConfig,
  ReaderThemePackV1,
  ThemeComponentId,
} from '@/lib/theme/schema/theme-pack-v1';
import { getThemeComponentBackground } from '@/lib/theme/component-background';
import { isAppComponentId } from '@/lib/theme/preview/component-registry';
import type { ThemeComponentId as TId } from '@/lib/theme/schema/theme-pack-v1';

export function readComponentBackground(
  pack: ReaderThemePackV1,
  componentId: ThemeComponentId,
): ContainerBackgroundConfig | undefined {
  return getThemeComponentBackground(pack, componentId);
}

export function readViewerTextContentBackground(
  pack: ReaderThemePackV1,
): ContainerBackgroundConfig | undefined {
  return pack.viewer?.text?.contentBackground;
}

export function patchComponentBackgroundConfig(
  pack: ReaderThemePackV1,
  componentId: ThemeComponentId,
  config: ContainerBackgroundConfig | undefined,
): ReaderThemePackV1 {
  const background = config?.type === 'none' ? undefined : config;

  if (isAppComponentId(componentId)) {
    return {
      ...pack,
      app: {
        ...pack.app!,
        components: {
          ...pack.app?.components,
          [componentId]: {
            ...pack.app?.components?.[componentId],
            background,
          },
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
        [componentId]: {
          ...pack.viewer?.components?.[componentId],
          background,
        },
      },
    },
  };
}

export function patchViewerTextContentBackground(
  pack: ReaderThemePackV1,
  config: ContainerBackgroundConfig | undefined,
): ReaderThemePackV1 {
  const contentBackground = config?.type === 'none' ? undefined : config;
  return {
    ...pack,
    viewer: {
      ...pack.viewer,
      text: {
        ...pack.viewer?.text,
        contentBackground,
      },
    },
  };
}

export function patchComponentBackground(
  pack: ReaderThemePackV1,
  componentId: ThemeComponentId,
  patch: Partial<Extract<ContainerBackgroundConfig, { type: 'asset' }>>,
): ReaderThemePackV1 {
  const current = readComponentBackground(pack, componentId);
  const base: Extract<ContainerBackgroundConfig, { type: 'asset' }> =
    current?.type === 'asset'
      ? current
      : { type: 'asset', assetId: '', fit: 'cover', opacity: 90, blurPx: 0 };

  const next: Extract<ContainerBackgroundConfig, { type: 'asset' }> = {
    ...base,
    ...patch,
    type: 'asset',
    assetId: patch.assetId ?? base.assetId,
  };

  if (!next.assetId) return pack;
  return patchComponentBackgroundConfig(pack, componentId, next);
}

export function patchViewerTextContentBackgroundAsset(
  pack: ReaderThemePackV1,
  patch: Partial<Extract<ContainerBackgroundConfig, { type: 'asset' }>>,
): ReaderThemePackV1 {
  const current = readViewerTextContentBackground(pack);
  const base: Extract<ContainerBackgroundConfig, { type: 'asset' }> =
    current?.type === 'asset'
      ? current
      : { type: 'asset', assetId: '', fit: 'cover', opacity: 90, blurPx: 0 };

  const next: Extract<ContainerBackgroundConfig, { type: 'asset' }> = {
    ...base,
    ...patch,
    type: 'asset',
    assetId: patch.assetId ?? base.assetId,
  };

  if (!next.assetId) return pack;
  return patchViewerTextContentBackground(pack, next);
}

export function patchComponentBackgroundAsset(
  pack: ReaderThemePackV1,
  componentId: TId,
  assetId: string,
  fileName: string,
  mime: string,
  kind: 'image' | 'gif' | 'video',
): ReaderThemePackV1 {
  const withAsset = {
    ...pack,
    assets: {
      ...pack.assets,
      [assetId]: { path: `assets/${fileName}`, mime, kind },
    },
  };
  return patchComponentBackground(withAsset, componentId, {
    assetId,
    fit: 'cover',
    opacity: 90,
    blurPx: 0,
  });
}

export interface ComponentBackgroundControlsProps {
  pack: ReaderThemePackV1;
  /** 组件级装饰背景 */
  componentId?: ThemeComponentId;
  /** 正文区 viewer.text.contentBackground 装饰层 */
  viewerTextContent?: boolean;
  onPatch: (updater: (draft: ReaderThemePackV1) => ReaderThemePackV1) => void;
}

export function ComponentBackgroundControls(props: ComponentBackgroundControlsProps) {
  const bg = createMemo(() => {
    if (props.viewerTextContent) return readViewerTextContentBackground(props.pack);
    if (props.componentId) return readComponentBackground(props.pack, props.componentId);
    return undefined;
  });

  const assetConfig = createMemo(() => {
    const c = bg();
    return c?.type === 'asset' ? c : undefined;
  });

  const legacySolid = createMemo(() => {
    const c = bg();
    return c?.type === 'solid' ? c : undefined;
  });

  const clearBackground = () => {
    props.onPatch((draft) => {
      if (props.viewerTextContent) return patchViewerTextContentBackground(draft, undefined);
      if (props.componentId) return patchComponentBackgroundConfig(draft, props.componentId, undefined);
      return draft;
    });
  };

  const patchAsset = (patch: Partial<Extract<ContainerBackgroundConfig, { type: 'asset' }>>) => {
    props.onPatch((draft) => {
      if (props.viewerTextContent) return patchViewerTextContentBackgroundAsset(draft, patch);
      if (props.componentId) return patchComponentBackground(draft, props.componentId, patch);
      return draft;
    });
  };

  return (
    <div class="space-y-2 rounded-lg border border-border/40 bg-muted/10 p-2">
      <p class="text-[11px] leading-relaxed text-muted-foreground">
        装饰背景：叠加在「颜色」Tab 所设底色之上的图片/视频。纯色、文字色请在「颜色」Tab 调整。
      </p>

      <Show when={legacySolid()}>
        <p class="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
          检测到旧版纯色装饰背景，与颜色 Tab 冲突。请改用语义色/阅读配色，并
          <button type="button" class="mx-0.5 underline cursor-pointer" onClick={clearBackground}>
            清除装饰层
          </button>
          。
        </p>
      </Show>

      <Show when={assetConfig()}>
        {(config) => (
          <>
            <div class="flex flex-wrap gap-1">
              <Button size="sm" variant="outline" class="cursor-pointer text-xs" onClick={clearBackground}>
                移除装饰图
              </Button>
            </div>
            <ThemeStudioOpacityBlurFields
              opacity={config().opacity ?? 90}
              blurPx={config().blurPx ?? 0}
              opacityLabel="装饰层不透明度"
              onOpacityChange={(opacity) => patchAsset({ opacity })}
              onBlurChange={(blurPx) => patchAsset({ blurPx })}
            />
            <div>
              <p class="mb-1 text-xs text-muted-foreground">填充</p>
              <div class="flex flex-wrap gap-1">
                <For each={['cover', 'contain', 'fill'] as const}>
                  {(fit) => (
                    <Button
                      size="sm"
                      variant={(config().fit ?? 'cover') === fit ? 'default' : 'outline'}
                      class="cursor-pointer text-xs"
                      onClick={() => patchAsset({ fit })}
                    >
                      {fit}
                    </Button>
                  )}
                </For>
              </div>
            </div>
          </>
        )}
      </Show>

      <Show when={!assetConfig() && !legacySolid()}>
        <p class="text-xs text-muted-foreground">尚未设置装饰图，请使用上方上传按钮。</p>
      </Show>
    </div>
  );
}

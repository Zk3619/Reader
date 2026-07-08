/**
 * Theme Studio — 阅读器壳层预览（真实组件 + 占位正文）
 */

import { For, Show, createMemo } from 'solid-js';
import { MediaViewerHeader } from '@/components/viewer/MediaViewerHeader';
import { MediaViewerFooter } from '@/components/viewer/MediaViewerFooter';
import { ThemedPreviewRegion } from '@/components/theme/ThemedPreviewRegion';
import { ThemedPreviewSurface } from '@/components/theme/ThemedPreviewSurface';
import { useThemeDraftRuntime } from '@/components/theme/ThemeDraftRuntimeProvider';
import type { ThemeComponentId, ViewerComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { themePreviewHighlight } from '@/lib/theme/preview/preview-highlight';
import { shouldShowViewerPreviewComponent } from '@/lib/theme/preview/preview-visibility';
import {
  mergeTextViewerSurfaceAppearanceStyle,
  resolveTextViewerSurfaceAppearance,
} from '@/lib/theme/text-viewer-surface-appearance';
import type { TextViewerThemeId } from '@/lib/theme/types';
import { cn } from '@/lib/utils';

const MOCK_CHAPTER =
  '第一章 开端\n\n这是主题预览用的示例正文。调整颜色、排版与背景后可在此实时查看效果。';

const TEXT_VIEWER_CONTENT_CLASS =
  'bg-[var(--text-viewer-content-bg)] text-[var(--text-viewer-content-text)]';

export interface ThemeViewerShellPreviewProps {
  themeId?: number;
  selectedComponentId?: ThemeComponentId;
  previewMode?: 'full' | 'component';
  class?: string;
}

export function ThemeViewerShellPreview(props: ThemeViewerShellPreviewProps) {
  const draft = useThemeDraftRuntime();
  const themeId = (): TextViewerThemeId => {
    const id = draft?.viewerPack()?.viewer?.text?.paletteId ?? props.themeId ?? 0;
    if (id === 'custom' || id == null) return 0;
    return id as TextViewerThemeId;
  };

  const contentSurfaceStyle = createMemo(() => {
    const pack = draft?.viewerPack();
    const appearance = resolveTextViewerSurfaceAppearance(themeId(), 'content', {
      config: pack?.viewer?.text
        ? { themeSurfaceAppearance: pack.viewer.text.surfaceAppearance }
        : undefined,
    });
    return mergeTextViewerSurfaceAppearanceStyle(
      { 'background-color': 'var(--text-viewer-content-bg)' },
      appearance,
    );
  });

  const show = (id: ViewerComponentId) =>
    shouldShowViewerPreviewComponent(id, props.previewMode ?? 'full', props.selectedComponentId);

  const highlight = (id: ViewerComponentId | 'readerChrome') =>
    themePreviewHighlight(id, props.selectedComponentId, props.previewMode);

  return (
    <ThemedPreviewRegion
      componentId="readerChrome"
      class={cn(
        'pointer-events-none flex h-full min-h-0 flex-col bg-background',
        highlight('readerChrome'),
        props.class,
      )}
      contentClass="flex min-h-0 flex-1 flex-col"
    >
      <Show when={show('toolbarHeader')}>
        <MediaViewerHeader layout="fixed" visible>
          <ThemedPreviewSurface
            componentId="toolbarHeader"
            class={cn(
              'flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm',
              highlight('toolbarHeader'),
            )}
          >
            <span class="text-muted-foreground">←</span>
            <span class="min-w-0 flex-1 truncate font-medium">示例书籍</span>
            <span class="text-muted-foreground">⋮</span>
          </ThemedPreviewSurface>
        </MediaViewerHeader>
      </Show>

      <Show when={show('contentSlot')}>
        <ThemedPreviewSurface
          componentId="contentSlot"
          class={cn(
            'relative flex-1 overflow-auto p-6',
            TEXT_VIEWER_CONTENT_CLASS,
            highlight('contentSlot'),
          )}
          style={contentSurfaceStyle()}
        >
          <div data-text-viewer-theme={String(themeId())}>
            <For each={MOCK_CHAPTER.split('\n\n')}>
              {(block) => <p class="mb-4 whitespace-pre-wrap leading-relaxed">{block}</p>}
            </For>
          </div>
        </ThemedPreviewSurface>
      </Show>

      <Show when={show('pageTip')}>
        <ThemedPreviewSurface
          componentId="pageTip"
          class={cn(
            'border-t border-border/40 px-4 py-1 text-center text-xs text-muted-foreground',
            highlight('pageTip'),
          )}
        >
          1 / 128 · 本章 3200 字
        </ThemedPreviewSurface>
      </Show>

      <Show when={show('footerChrome')}>
        <MediaViewerFooter layout="fixed" visible>
          <ThemedPreviewSurface
            componentId="footerChrome"
            class={cn(
              'flex items-center justify-center gap-4 px-4 py-3 text-sm text-muted-foreground',
              highlight('footerChrome'),
            )}
          >
            <span>上一章</span>
            <span>目录</span>
            <span>下一章</span>
          </ThemedPreviewSurface>
        </MediaViewerFooter>
      </Show>

      <Show when={show('brightnessCapsule')}>
        <ThemedPreviewSurface
          componentId="brightnessCapsule"
          class={cn(
            'absolute bottom-4 right-4 rounded-full border border-border/50 bg-background/90 px-3 py-2 text-xs shadow-md backdrop-blur-sm',
            highlight('brightnessCapsule'),
          )}
        >
          亮度 75%
        </ThemedPreviewSurface>
      </Show>
    </ThemedPreviewRegion>
  );
}

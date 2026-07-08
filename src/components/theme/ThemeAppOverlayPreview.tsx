/**
 * Theme Studio — 浮层类组件预览（dialog / dropdown / toast 等）
 */

import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { ThemedPreviewSurface } from '@/components/theme/ThemedPreviewSurface';
import type { AppComponentId, ThemeComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { themePreviewHighlight } from '@/lib/theme/preview/preview-highlight';
import {
  isAppOverlayComponent,
  shouldShowAppPreviewComponent,
} from '@/lib/theme/preview/preview-visibility';
import { cn } from '@/lib/utils';

export interface ThemeAppOverlayPreviewProps {
  selectedComponentId?: ThemeComponentId;
  previewMode?: 'full' | 'component';
}

export function ThemeAppOverlayPreview(props: ThemeAppOverlayPreviewProps) {
  const show = (id: AppComponentId) =>
    shouldShowAppPreviewComponent(id, props.previewMode ?? 'full', props.selectedComponentId);

  const highlight = (id: AppComponentId) =>
    themePreviewHighlight(id, props.selectedComponentId, props.previewMode);

  const showSection = () => {
    if (props.previewMode !== 'component') return true;
    const selected = props.selectedComponentId;
    if (!selected) return true;
    return isAppOverlayComponent(selected as AppComponentId);
  };

  return (
    <Show when={showSection()}>
      <div class="shrink-0 space-y-3 border-t border-border/60 bg-muted/10 p-3">
        <p class="text-xs font-medium text-muted-foreground">浮层组件</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <Show when={show('button')}>
            <ThemedPreviewSurface
              componentId="button"
              class={cn('flex flex-wrap gap-2 rounded-xl border border-border/40 p-3', highlight('button'))}
            >
              <Button size="sm">主要</Button>
              <Button size="sm" variant="secondary">
                次要
              </Button>
              <Button size="sm" variant="outline">
                描边
              </Button>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('dialog')}>
            <ThemedPreviewSurface
              componentId="dialog"
              class={cn(
                'rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg',
                highlight('dialog'),
              )}
            >
              <p class="font-semibold">对话框标题</p>
              <p class="mt-1 text-sm text-muted-foreground">确认操作的对话框内容预览。</p>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('dropdown')}>
            <ThemedPreviewSurface
              componentId="dropdown"
              class={cn(
                'w-full rounded-lg border border-border bg-popover p-2 text-sm shadow-md',
                highlight('dropdown'),
              )}
            >
              <ul class="space-y-1">
                <li class="rounded-md px-2 py-1.5">菜单项 A</li>
                <li class="rounded-md px-2 py-1.5 bg-accent/50">菜单项 B</li>
              </ul>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('select')}>
            <ThemedPreviewSurface
              componentId="select"
              class={cn(
                'rounded-lg border border-border bg-popover p-2 text-sm',
                highlight('select'),
              )}
            >
              <p class="font-medium">选项一</p>
              <p class="text-muted-foreground">选项二</p>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('combobox')}>
            <ThemedPreviewSurface
              componentId="combobox"
              class={cn(
                'rounded-lg border border-border bg-popover p-2 text-sm',
                highlight('combobox'),
              )}
            >
              <p>搜索并选择…</p>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('contextMenu')}>
            <ThemedPreviewSurface
              componentId="contextMenu"
              class={cn(
                'rounded-lg border border-border bg-popover p-2 text-sm shadow-md',
                highlight('contextMenu'),
              )}
            >
              <p>打开</p>
              <p>删除</p>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('drawer')}>
            <ThemedPreviewSurface
              componentId="drawer"
              class={cn(
                'rounded-t-xl border border-border bg-background p-4 shadow-xl',
                highlight('drawer'),
              )}
            >
              <div class="mx-auto mb-3 h-1 w-12 rounded-full bg-muted" />
              <p class="font-medium">底部抽屉</p>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('toast')}>
            <ThemedPreviewSurface
              componentId="toast"
              class={cn(
                'rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-md',
                highlight('toast'),
              )}
            >
              操作已完成
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('settingsRow')}>
            <ThemedPreviewSurface
              componentId="settingsRow"
              class={cn('rounded-xl border border-border bg-card p-4', highlight('settingsRow'))}
            >
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="font-medium">设置项</p>
                  <p class="text-sm text-muted-foreground">说明文字</p>
                </div>
                <div class="h-6 w-11 rounded-full bg-primary/20" />
              </div>
            </ThemedPreviewSurface>
          </Show>
        </div>
      </div>
    </Show>
  );
}

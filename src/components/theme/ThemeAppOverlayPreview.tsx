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
import {
  themePreviewSurfaceShellClass,
  themePreviewTextClasses,
} from '@/lib/theme/preview/theme-component-text-roles';
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
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Show when={show('button')}>
            <ThemedPreviewSurface
              componentId="button"
              class={cn(
                'flex flex-wrap gap-2 rounded-xl border border-border/40 bg-card p-3',
                highlight('button'),
              )}
            >
              <Button size="sm">主要</Button>
              <Button size="sm" variant="secondary">
                次要
              </Button>
              <Button size="sm" variant="outline" class="text-foreground">
                描边
              </Button>
              <Button size="sm" variant="destructive">
                危险
              </Button>
              <Button size="sm" variant="ghost" class="text-foreground">
                幽灵
              </Button>
              <Button size="sm" variant="link">
                链接
              </Button>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('dialog')}>
            <ThemedPreviewSurface
              componentId="dialog"
              class={cn(
                'rounded-xl border border-border p-4 shadow-lg',
                themePreviewSurfaceShellClass('dialog'),
                highlight('dialog'),
              )}
            >
              <p class={cn('font-semibold', themePreviewTextClasses('dialog').primary)}>对话框标题</p>
              <p class={cn('mt-1 text-sm', themePreviewTextClasses('dialog').muted)}>
                确认操作的对话框内容预览。
              </p>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('dropdown')}>
            <ThemedPreviewSurface
              componentId="dropdown"
              class={cn(
                'w-full rounded-lg border border-border p-2 text-sm shadow-md',
                themePreviewSurfaceShellClass('dropdown'),
                highlight('dropdown'),
              )}
            >
              <ul class="space-y-1">
                <li
                  class={cn(
                    'rounded-md px-2 py-1.5',
                    themePreviewTextClasses('dropdown').primary,
                  )}
                >
                  菜单项 A
                </li>
                <li
                  class={cn(
                    'rounded-md px-2 py-1.5 bg-accent/50',
                    themePreviewTextClasses('dropdown').primary,
                  )}
                >
                  菜单项 B
                </li>
              </ul>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('select')}>
            <ThemedPreviewSurface
              componentId="select"
              class={cn(
                'rounded-lg border border-border p-2 text-sm',
                themePreviewSurfaceShellClass('select'),
                highlight('select'),
              )}
            >
              <p class={cn('font-medium', themePreviewTextClasses('select').primary)}>选项一</p>
              <p class={themePreviewTextClasses('select').muted}>选项二</p>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('combobox')}>
            <ThemedPreviewSurface
              componentId="combobox"
              class={cn(
                'rounded-lg border border-border p-2 text-sm',
                themePreviewSurfaceShellClass('combobox'),
                highlight('combobox'),
              )}
            >
              <p class={themePreviewTextClasses('combobox').primary}>搜索并选择…</p>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('contextMenu')}>
            <ThemedPreviewSurface
              componentId="contextMenu"
              class={cn(
                'rounded-lg border border-border p-2 text-sm shadow-md',
                themePreviewSurfaceShellClass('contextMenu'),
                highlight('contextMenu'),
              )}
            >
              <p class={themePreviewTextClasses('contextMenu').primary}>打开</p>
              <p class={themePreviewTextClasses('contextMenu').primary}>删除</p>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('drawer')}>
            <ThemedPreviewSurface
              componentId="drawer"
              class={cn(
                'rounded-t-xl border border-border p-4 shadow-xl',
                themePreviewSurfaceShellClass('drawer'),
                highlight('drawer'),
              )}
            >
              <div class="mx-auto mb-3 h-1 w-12 rounded-full bg-muted" />
              <p class={cn('font-medium', themePreviewTextClasses('drawer').primary)}>底部抽屉</p>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('toast')}>
            <ThemedPreviewSurface
              componentId="toast"
              class={cn(
                'rounded-lg border border-border px-4 py-3 text-sm shadow-md',
                themePreviewSurfaceShellClass('toast'),
                highlight('toast'),
              )}
            >
              <span class={themePreviewTextClasses('toast').primary}>操作已完成</span>
            </ThemedPreviewSurface>
          </Show>

          <Show when={show('settingsRow')}>
            <ThemedPreviewSurface
              componentId="settingsRow"
              class={cn(
                'rounded-xl border border-border p-4',
                themePreviewSurfaceShellClass('settingsRow'),
                highlight('settingsRow'),
              )}
            >
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class={cn('font-medium', themePreviewTextClasses('settingsRow').primary)}>
                    设置项
                  </p>
                  <p class={cn('text-sm', themePreviewTextClasses('settingsRow').muted)}>
                    说明文字
                  </p>
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

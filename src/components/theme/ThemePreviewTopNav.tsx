/**
 * Theme Studio — 顶部导航栏预览（对齐 Navigation.tsx 静态壳层）
 */

import { Show } from 'solid-js';
import logoLight from '@/assets/logo-l-512x512.png';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { ThemedPreviewRegion } from '@/components/theme/ThemedPreviewRegion';
import { BookshelfIcon } from '@/components/shared/icons';
import type { AppComponentId, ThemeComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { themePreviewHighlight } from '@/lib/theme/preview/preview-highlight';
import { shouldShowAppPreviewComponent } from '@/lib/theme/preview/preview-visibility';
import { themePreviewTextClasses } from '@/lib/theme/preview/theme-component-text-roles';
import { cn } from '@/lib/utils';

export interface ThemePreviewTopNavProps {
  selectedComponentId?: ThemeComponentId;
  previewMode?: 'full' | 'component';
  colorMode?: 'light' | 'dark';
}

export function ThemePreviewTopNav(props: ThemePreviewTopNavProps) {
  const shell = useShellLayout();

  const show = (id: AppComponentId) =>
    shouldShowAppPreviewComponent(id, props.previewMode ?? 'full', props.selectedComponentId);

  const highlight = (id: AppComponentId) =>
    themePreviewHighlight(id, props.selectedComponentId, props.previewMode);

  return (
    <Show when={shell().showTopNavigation && show('topNav')}>
      <ThemedPreviewRegion
        componentId="topNav"
        class={cn(
          'pointer-events-none shrink-0 border-b border-border/40 bg-background/95 backdrop-blur',
          highlight('topNav'),
        )}
      >
        <header class="flex h-14 min-h-14 items-center justify-between gap-2 px-3 sm:px-4">
          <div class="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div class="flex shrink-0 items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shadow-sm">
                <img src={logoLight} alt="阅读" class="h-6 w-6" />
              </div>
              <span
                class={cn('text-sm font-semibold', themePreviewTextClasses('topNav').primary)}
              >
                阅读
              </span>
            </div>
            <div
              class={cn(
                'flex h-9 min-w-0 max-w-[10rem] items-center gap-1.5 rounded-md border border-border/50 px-3 text-sm font-medium',
                themePreviewTextClasses('topNav').primary,
              )}
            >
              <BookshelfIcon class="h-4 w-4 shrink-0" size={16} />
              <span class="min-w-0 truncate">书架</span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <div class="h-8 w-8 rounded-md bg-muted/70" />
            <div class="hidden h-8 w-20 rounded-md bg-muted/50 sm:block" />
          </div>
        </header>
      </ThemedPreviewRegion>
    </Show>
  );
}

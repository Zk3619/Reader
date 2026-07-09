/**
 * Theme Studio — 主程序真实壳层预览（占位内容 + 运行时组件背景）
 */

import { For, Show } from 'solid-js';
import type { ThemePreviewViewport } from '@/lib/theme/preview/preview-viewport';
import { ThemedPreviewRegion } from '@/components/theme/ThemedPreviewRegion';
import { ThemedPreviewSurface } from '@/components/theme/ThemedPreviewSurface';
import { ThemePreviewSidebar } from '@/components/theme/ThemePreviewSidebar';
import { ThemePreviewTopNav } from '@/components/theme/ThemePreviewTopNav';
import { ThemePreviewSettingsSection } from '@/components/theme/ThemePreviewSettingsSection';
import { ThemeAppOverlayPreview } from '@/components/theme/ThemeAppOverlayPreview';
import type { AppComponentId, ThemeComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { themePreviewHighlight } from '@/lib/theme/preview/preview-highlight';
import { shouldShowAppPreviewComponent } from '@/lib/theme/preview/preview-visibility';
import {
  bookGroupGridCardClass,
  bookGroupGridCoverClass,
  bookGroupGridMetaClass,
  bookGroupGridSubtitleClass,
  bookGroupGridTitleClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { mainShellPageRoot, scrollEdgeInset } from '@/lib/ui/viewport-classes';
import { themePreviewTextClasses } from '@/lib/theme/preview/theme-component-text-roles';
import { cn } from '@/lib/utils';

const MOCK_BOOKS = [
  { title: '示例书籍一', author: '作者甲' },
  { title: '示例书籍二', author: '作者乙' },
  { title: '示例书籍三', author: '作者丙' },
  { title: '示例书籍四', author: '作者丁' },
];

export interface ThemeAppShellPreviewProps {
  selectedComponentId?: ThemeComponentId;
  previewMode?: 'full' | 'component';
  showSidebar?: boolean;
  viewport?: ThemePreviewViewport;
  class?: string;
}

export function ThemeAppShellPreview(props: ThemeAppShellPreviewProps) {
  const show = (id: AppComponentId) =>
    shouldShowAppPreviewComponent(id, props.previewMode ?? 'full', props.selectedComponentId);

  const highlight = (id: AppComponentId) =>
    themePreviewHighlight(id, props.selectedComponentId, props.previewMode);

  const showSidebar = () => props.showSidebar !== false;

  const settingsFocused = () => {
    const mode = props.previewMode ?? 'full';
    const id = props.selectedComponentId;
    if (mode !== 'component' || !id) return false;
    return id === 'settingsTabPanel' || id === 'settingsCard' || id === 'settingsRow';
  };

  const showBookshelfBlock = () =>
    !settingsFocused() &&
    (show('pageToolbar') ||
      show('bookshelfCard') ||
      show('bookshelfGroupCard') ||
      show('surfaceCard') ||
      show('recordCard'));

  return (
    <ThemedPreviewRegion
      componentId="appShell"
      class={cn(
        'pointer-events-none flex w-full flex-col bg-background text-foreground',
        highlight('appShell'),
        props.class,
      )}
      contentClass="flex w-full flex-col"
    >
      <ThemePreviewTopNav
        selectedComponentId={props.selectedComponentId}
        previewMode={props.previewMode}
      />

      <div class="flex min-w-0 flex-row items-stretch">
        <Show when={showSidebar()}>
          <ThemePreviewSidebar
            selectedComponentId={props.selectedComponentId}
            previewMode={props.previewMode}
            viewport={props.viewport}
          />
        </Show>

        <ThemedPreviewRegion
          componentId="pageContent"
          class={cn('flex min-w-0 flex-1 flex-col', highlight('pageContent'))}
          contentClass={cn(
            'relative z-1 flex w-full min-w-0 flex-col',
            scrollEdgeInset,
          )}
        >
          <Show when={showBookshelfBlock()}>
            <section class={cn('flex shrink-0 flex-col', mainShellPageRoot)}>
              <Show when={show('pageToolbar')}>
                <ThemedPreviewSurface
                  componentId="pageToolbar"
                  class={cn('shrink-0 px-4 pt-4', highlight('pageToolbar'))}
                >
                  <div class="flex items-center justify-between gap-4">
                    <div class="min-w-0 flex-1 overflow-hidden">
                      <h2
                        class={cn(
                          'truncate text-2xl font-bold leading-tight',
                          themePreviewTextClasses('pageToolbar').primary,
                        )}
                      >
                        书架
                      </h2>
                      <p
                        class={cn(
                          'truncate text-sm',
                          themePreviewTextClasses('pageToolbar').muted,
                        )}
                      >
                        管理你的书籍收藏
                      </p>
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                      <div class="h-9 w-9 rounded-md bg-muted/70" />
                      <div class="h-9 w-9 rounded-md bg-muted/70" />
                    </div>
                  </div>
                </ThemedPreviewSurface>
              </Show>

              <div class="flex flex-col gap-3 p-2">
                <Show when={show('bookshelfCard') || show('bookshelfGroupCard')}>
                  <div class="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                    <For each={MOCK_BOOKS}>
                      {(book) => (
                        <Show when={show('bookshelfCard')}>
                          <ThemedPreviewSurface
                            componentId="bookshelfCard"
                            class={cn(bookGroupGridCardClass(), highlight('bookshelfCard'))}
                          >
                            <div class="flex w-full flex-col">
                              <div class={bookGroupGridCoverClass()}>
                                <div class="h-full w-full bg-muted/70" />
                              </div>
                              <div class={bookGroupGridMetaClass()}>
                                <p class={bookGroupGridTitleClass()}>{book.title}</p>
                                <p class={bookGroupGridSubtitleClass()}>{book.author}</p>
                              </div>
                            </div>
                          </ThemedPreviewSurface>
                        </Show>
                      )}
                    </For>
                    <Show when={show('bookshelfGroupCard')}>
                      <ThemedPreviewSurface
                        componentId="bookshelfGroupCard"
                        class={cn(bookGroupGridCardClass(), highlight('bookshelfGroupCard'))}
                      >
                        <div class="flex w-full flex-col">
                          <div class={bookGroupGridCoverClass()}>
                            <div class="h-full w-full bg-muted/70" />
                          </div>
                          <div class={bookGroupGridMetaClass()}>
                            <p class={bookGroupGridTitleClass()}>默认分组</p>
                            <p class={bookGroupGridSubtitleClass()}>12 本书</p>
                          </div>
                        </div>
                      </ThemedPreviewSurface>
                    </Show>
                  </div>
                </Show>

                <Show when={show('surfaceCard')}>
                  <ThemedPreviewSurface
                    componentId="surfaceCard"
                    class={cn(
                      'rounded-xl border border-border/50 bg-card p-3 text-card-foreground',
                      highlight('surfaceCard'),
                    )}
                  >
                    <p class={cn('font-medium', themePreviewTextClasses('surfaceCard').primary)}>
                      探索 / 书源列表行
                    </p>
                    <p class={cn('text-xs', themePreviewTextClasses('surfaceCard').muted)}>
                      通用表面卡片占位
                    </p>
                  </ThemedPreviewSurface>
                </Show>

                <Show when={show('recordCard')}>
                  <ThemedPreviewSurface
                    componentId="recordCard"
                    class={cn(
                      'rounded-xl border border-border/50 bg-card p-4 text-card-foreground',
                      highlight('recordCard'),
                    )}
                  >
                    <p class={cn('font-medium', themePreviewTextClasses('recordCard').primary)}>
                      阅读记录区块
                    </p>
                    <p class={cn('text-sm', themePreviewTextClasses('recordCard').muted)}>
                      最近阅读 · 时长统计
                    </p>
                  </ThemedPreviewSurface>
                </Show>
              </div>
            </section>
          </Show>

          <div class={cn('shrink-0 p-2', settingsFocused() && 'flex flex-col')}>
            <ThemePreviewSettingsSection
              selectedComponentId={props.selectedComponentId}
              previewMode={props.previewMode}
            />
          </div>

          <ThemeAppOverlayPreview
            selectedComponentId={props.selectedComponentId}
            previewMode={props.previewMode}
          />
        </ThemedPreviewRegion>
      </div>
    </ThemedPreviewRegion>
  );
}

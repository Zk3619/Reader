/**
 * Theme Studio — 主程序真实壳层预览（占位内容 + 运行时组件背景）
 */

import { For, Show } from 'solid-js';
import type { ThemePreviewViewport } from '@/lib/theme/preview/preview-viewport';
import { ThemedPreviewRegion } from '@/components/theme/ThemedPreviewRegion';
import { ThemedPreviewSurface } from '@/components/theme/ThemedPreviewSurface';
import { ThemePreviewSidebar } from '@/components/theme/ThemePreviewSidebar';
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
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import { BookshelfIcon } from '@/components/shared/icons';

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

  return (
    <ThemedPreviewRegion
      componentId="appShell"
      class={cn(
        'pointer-events-none flex h-full min-h-0 w-full flex-col bg-background text-foreground',
        highlight('appShell'),
        props.class,
      )}
      contentClass="flex h-full min-h-0 w-full flex-row"
    >
      <Show when={showSidebar()}>
        <ThemePreviewSidebar
          selectedComponentId={props.selectedComponentId}
          previewMode={props.previewMode}
          viewport={props.viewport}
        />
      </Show>

      <ThemedPreviewRegion
        componentId="pageContent"
        class={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', highlight('pageContent'))}
        contentClass="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <section class={cn('flex min-h-0 flex-1 flex-col overflow-hidden', mainShellPageRoot)}>
          <Show when={show('pageToolbar')}>
            <ThemedPreviewSurface
              componentId="pageToolbar"
              class={cn('shrink-0 px-4 pt-4', highlight('pageToolbar'))}
            >
              <div class="flex items-center justify-between gap-4">
                <div class="min-w-0 flex-1 overflow-hidden">
                  <h2 class="truncate text-2xl font-bold leading-tight text-foreground">书架</h2>
                  <p class="truncate text-sm text-muted-foreground">管理你的书籍收藏</p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <div class="h-9 w-9 rounded-md bg-muted/70" />
                  <div class="h-9 w-9 rounded-md bg-muted/70" />
                </div>
              </div>
            </ThemedPreviewSurface>
          </Show>

          <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col gap-3 p-2')}>
            <Show when={show('bookshelfCard') || show('bookshelfGroupCard')}>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
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

            <Show when={show('settingsCard') || show('settingsTabPanel')}>
              <ThemedPreviewRegion
                componentId="settingsTabPanel"
                class={cn('rounded-xl border border-border/50 p-3', highlight('settingsTabPanel'))}
              >
                <Show when={show('settingsCard')}>
                  <ThemedPreviewSurface
                    componentId="settingsCard"
                    class={cn(
                      'flex h-16 w-full items-center gap-3 rounded-xl border border-border/50 p-2',
                      highlight('settingsCard'),
                    )}
                  >
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <BookshelfIcon class="h-5 w-5" size={20} />
                    </span>
                    <div class="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden text-left">
                      <span class="truncate font-medium text-foreground">设置项示例</span>
                      <span class="truncate text-xs text-muted-foreground">分类卡片背景预览</span>
                    </div>
                  </ThemedPreviewSurface>
                </Show>
              </ThemedPreviewRegion>
            </Show>

            <Show when={show('surfaceCard')}>
              <ThemedPreviewSurface
                componentId="surfaceCard"
                class={cn('rounded-xl border border-border/50 p-3', highlight('surfaceCard'))}
              >
                <p class="font-medium">探索 / 书源列表行</p>
                <p class="text-xs text-muted-foreground">通用表面卡片占位</p>
              </ThemedPreviewSurface>
            </Show>

            <Show when={show('recordCard')}>
              <ThemedPreviewSurface
                componentId="recordCard"
                class={cn('rounded-xl border border-border/50 p-4', highlight('recordCard'))}
              >
                <p class="font-medium">阅读记录区块</p>
                <p class="text-sm text-muted-foreground">最近阅读 · 时长统计</p>
              </ThemedPreviewSurface>
            </Show>
          </div>
        </section>

        <ThemeAppOverlayPreview
          selectedComponentId={props.selectedComponentId}
          previewMode={props.previewMode}
        />
      </ThemedPreviewRegion>
    </ThemedPreviewRegion>
  );
}

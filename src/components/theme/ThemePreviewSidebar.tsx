/**
 * Theme Studio — 侧栏预览（对齐 SideBar.tsx 真实 DOM，静态布局无 fixed）
 */

import { For, Show } from 'solid-js';
import type { ThemePreviewViewport } from '@/lib/theme/preview/preview-viewport';
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { ThemedPreviewRegion } from '@/components/theme/ThemedPreviewRegion';
import {
  BookshelfIcon,
  BookOpenIcon,
  BookSourceIcon,
  RssTabIcon,
  BookmarkIcon,
  RecordIcon,
  SettingsIcon,
  ChevronLeftIcon,
} from '@/components/shared/icons';
import type { AppComponentId, ThemeComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { themePreviewHighlight } from '@/lib/theme/preview/preview-highlight';
import { shouldShowAppPreviewComponent } from '@/lib/theme/preview/preview-visibility';
import { themePreviewTextClasses } from '@/lib/theme/preview/theme-component-text-roles';
import { cn } from '@/lib/utils';

const NAV_PAGES = [
  { id: 'bookshelf', label: '书架', icon: BookshelfIcon, active: true },
  { id: 'scout', label: '探索', icon: BookOpenIcon, active: false },
  { id: 'sources', label: '书源', icon: BookSourceIcon, active: false },
  { id: 'rss', label: '订阅', icon: RssTabIcon, active: false },
  { id: 'bookmark', label: '书签', icon: BookmarkIcon, active: false },
  { id: 'record', label: '记录', icon: RecordIcon, active: false },
  { id: 'settings', label: '设置', icon: SettingsIcon, active: false },
] as const;

const MOCK_RECENT = [
  { title: '示例书籍一', chapter: '第三章 风起' },
  { title: '示例书籍二', chapter: '第十二章 转折' },
];

function sidebarNavButtonClass(active: boolean) {
  return cn(
    'relative overflow-hidden rounded-xl border-l-2 transition-colors duration-200',
    'text-sidebar-foreground/70 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-current',
    active
      ? 'border-l-primary bg-primary/10! text-primary! font-semibold shadow-sm'
      : 'border-l-transparent',
    !active && 'hover:bg-primary/10 hover:text-primary hover:shadow-sm',
    'h-10',
  );
}

export interface ThemePreviewSidebarProps {
  selectedComponentId?: ThemeComponentId;
  previewMode?: 'full' | 'component';
  viewport?: ThemePreviewViewport;
}

function previewSidebarWidthClass(viewport: ThemePreviewViewport = 'desktop'): string {
  switch (viewport) {
    case 'mobile':
      return 'w-28';
    case 'tablet':
      return 'w-36';
    default:
      return 'w-48';
  }
}

export function ThemePreviewSidebar(props: ThemePreviewSidebarProps) {
  const highlight = (id: AppComponentId) =>
    themePreviewHighlight(id, props.selectedComponentId, props.previewMode);

  const show = (id: AppComponentId) =>
    shouldShowAppPreviewComponent(id, props.previewMode ?? 'full', props.selectedComponentId);

  return (
    <ThemedPreviewRegion
      componentId="sidebar"
      class={cn(
        'flex shrink-0 self-stretch flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        previewSidebarWidthClass(props.viewport),
        highlight('sidebar'),
      )}
      contentClass="flex min-h-full flex-col"
    >
      <Show when={show('sidebarHeader')}>
        <ThemedPreviewRegion
          componentId="sidebarHeader"
          class={cn('pointer-events-none min-h-12 shrink-0', highlight('sidebarHeader'))}
        />
      </Show>

      <SidebarContent class="relative z-1 flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
        <Show when={show('sidebarNav')}>
          <ThemedPreviewRegion
            componentId="sidebarNav"
            class={cn('relative shrink-0 overflow-hidden', highlight('sidebarNav'))}
            contentClass="relative z-1"
          >
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <For each={NAV_PAGES}>
                    {(page) => (
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={page.active}
                          tooltip={page.label}
                          class={sidebarNavButtonClass(page.active)}
                        >
                          <page.icon class="h-5 w-5" size={20} />
                          <span class="min-w-0 flex-1 truncate font-medium">{page.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </For>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </ThemedPreviewRegion>
        </Show>

        <Show when={show('sidebarRecent')}>
          <ThemedPreviewRegion
            componentId="sidebarRecent"
            class={cn('relative min-h-0 shrink overflow-hidden', highlight('sidebarRecent'))}
            contentClass="relative z-1"
          >
            <Separator />
            <SidebarGroup>
              <SidebarGroupLabel class="text-xs font-semibold text-sidebar-foreground/70">
                最近读过
              </SidebarGroupLabel>
              <SidebarGroupContent class="mt-3">
                <SidebarMenu>
                  <For each={MOCK_RECENT}>
                    {(book, index) => (
                      <>
                        <Show when={index() > 0}>
                          <Separator class="my-1 h-0.5" />
                        </Show>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            class={cn(
                              sidebarNavButtonClass(false),
                              'h-auto w-full items-center gap-2.5 py-2 px-3 text-left',
                            )}
                          >
                            <span class="flex h-12 w-9 shrink-0 overflow-hidden rounded-sm border border-border/40 bg-muted/70" />
                            <div class="min-w-0 flex-1 overflow-hidden">
                              <span
                                class={cn(
                                  'block w-full min-w-0 truncate text-xs font-medium',
                                  themePreviewTextClasses('sidebarRecent').primary,
                                )}
                              >
                                {book.title}
                              </span>
                              <span
                                class={cn(
                                  'block w-full min-w-0 truncate text-xs',
                                  themePreviewTextClasses('sidebarRecent').muted,
                                )}
                              >
                                {book.chapter}
                              </span>
                            </div>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </>
                    )}
                  </For>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </ThemedPreviewRegion>
        </Show>
      </SidebarContent>

      <Show when={show('sidebarFooter')}>
        <ThemedPreviewRegion
          componentId="sidebarFooter"
          class={cn(
            'mt-auto shrink-0 overflow-hidden border-t border-sidebar-border',
            highlight('sidebarFooter'),
          )}
        >
          <SidebarFooter class="p-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="收起侧边栏"
                  class={cn(sidebarNavButtonClass(false), '[&_svg]:size-4')}
                >
                  <ChevronLeftIcon class="h-4 w-4" size={16} />
                  <span class="font-medium">收起</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </ThemedPreviewRegion>
      </Show>
    </ThemedPreviewRegion>
  );
}

/**
 * 阅读模块侧栏：子页导航 + 最近读过
 */

import { type Accessor, For, Show } from 'solid-js';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  sidebarNavButtonClass,
  sidebarNavMenuClass,
  sidebarNavMenuItemClass,
} from '@/lib/shell/sidebar-nav-button-class';
import { BookOpenIcon } from '@/components/shared/icons';
import { BookCoverFromBook } from '@/components/media/reader/books/BookCoverFromBook';
import type { RecentReadBook } from '@/lib/bookshelf/recent-reading';
import { Dynamic } from 'solid-js/web';
import { getModuleNavItems } from '@/lib/modules/module-nav-registry';

export interface ReaderModuleSidebarSectionProps {
  collapsed?: boolean;
  activeTab: string | Accessor<string>;
  onTabChange: (tabId: string) => void;
  recentBooks?: RecentReadBook[];
  onOpenRecentBook?: (book: RecentReadBook) => void;
  onOpenReaderRecord?: () => void;
}

const READER_ITEMS = getModuleNavItems('reader');

export function ReaderModuleSidebarSection(props: ReaderModuleSidebarSectionProps) {
  const recentBooks = () => props.recentBooks ?? [];
  const isCollapsed = () => props.collapsed ?? false;
  // 始终从 props 读取，避免误传 string 快照时选中态冻住
  const activeTab = (): string => {
    const value = props.activeTab;
    return typeof value === 'function' ? value() : value;
  };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu class={sidebarNavMenuClass(isCollapsed())}>
            <For each={READER_ITEMS}>
              {(item) => (
                <SidebarMenuItem class={sidebarNavMenuItemClass(isCollapsed())}>
                  <SidebarMenuButton
                    isActive={activeTab() === item.id}
                    onClick={() => props.onTabChange(item.id)}
                    tooltip={item.label}
                    class={sidebarNavButtonClass(activeTab() === item.id, {
                      collapsed: isCollapsed(),
                      extra: 'group/menu-button',
                    })}
                  >
                    <Show when={item.icon}>
                      <span class={cn('shrink-0', isCollapsed() && 'mx-auto')}>
                        <Dynamic component={item.icon!} class="h-5 w-5" />
                      </span>
                    </Show>
                    <span class={cn('min-w-0 flex-1 truncate font-medium', isCollapsed() && 'hidden')}>
                      {item.label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </For>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <Show when={recentBooks().length > 0 || !isCollapsed()}>
        <Separator />
        <SidebarGroup>
          <SidebarGroupLabel
            class={cn(
              'text-xs font-semibold text-sidebar-foreground/70',
              isCollapsed() && 'sr-only',
              !isCollapsed() && 'cursor-pointer hover:text-primary',
            )}
            onClick={() => !isCollapsed() && props.onOpenReaderRecord?.()}
          >
            最近读过
          </SidebarGroupLabel>
          <SidebarGroupContent class={cn(!isCollapsed() && 'mt-3')}>
            <Show
              when={recentBooks().length > 0}
              fallback={
                <Show when={!isCollapsed()}>
                  <p class="px-3 py-2 text-xs text-muted-foreground">尚无阅读记录</p>
                </Show>
              }
            >
              <SidebarMenu class={sidebarNavMenuClass(isCollapsed())}>
                <For each={recentBooks().slice(0, isCollapsed() ? 3 : 5)}>
                  {(book, index) => (
                    <>
                      <Show when={!isCollapsed() && index() > 0}>
                        <Separator class="my-1 h-0.3" />
                      </Show>
                      <SidebarMenuItem class={sidebarNavMenuItemClass(isCollapsed())}>
                        <SidebarMenuButton
                          class={cn(
                            'relative overflow-hidden rounded-xl transition-colors duration-200',
                            'text-sidebar-foreground/70 hover:bg-primary/10 hover:text-primary hover:shadow-sm',
                            isCollapsed()
                              ? 'h-10 justify-center border-l-transparent px-0'
                              : 'group/recent-item h-auto w-full items-center gap-2.5 border-l-2 border-l-transparent py-2 px-3 text-left',
                          )}
                          tooltip={`${book.title} - ${book.chapterName}`}
                          onClick={() => props.onOpenRecentBook?.(book)}
                        >
                          <span
                            class={cn(
                              'flex shrink-0 overflow-hidden rounded-sm border border-border/40 bg-muted',
                              isCollapsed() ? 'mx-auto h-8 w-6' : 'h-12 w-9',
                            )}
                          >
                            <BookCoverFromBook
                              book={book.book}
                              bookUrl={book.bookUrl || undefined}
                              coverUrl={book.coverUrl}
                              alt={book.title}
                              class="h-full w-full object-cover"
                              fallback={
                                <span class="flex h-full w-full items-center justify-center">
                                  <BookOpenIcon class="h-3.5 w-3.5 text-muted-foreground" size={14} />
                                </span>
                              }
                            />
                          </span>
                          <Show when={!isCollapsed()}>
                            <div class="min-w-0 flex-1 overflow-hidden">
                              <span class="block w-full min-w-0 truncate text-xs font-medium">
                                {book.title}
                              </span>
                              <span class="block w-full min-w-0 truncate text-xs text-muted-foreground group-hover/recent-item:text-primary">
                                {book.chapterName}
                              </span>
                            </div>
                          </Show>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </>
                  )}
                </For>
              </SidebarMenu>
            </Show>
          </SidebarGroupContent>
        </SidebarGroup>
      </Show>
    </>
  );
}

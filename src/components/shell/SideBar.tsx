import { For, Show, type Accessor, type Component } from "solid-js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { PageType } from "@/components/shell/Navigation";
import { BookshelfPendingUpdateNavBadge } from '@/components/bookshelf/BookshelfPendingUpdateBadge';
import {
  BookshelfIcon,
  BookOpenIcon,
  BookSourceIcon,
  SubscriptionIcon,
  BookmarkIcon,
  BookInfoIcon,
  RecordIcon,
  SettingsIcon,
  GlobeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/shared/icons";
import { BookCoverFromBook } from '@/components/books/BookCoverFromBook';
import type { RecentReadBook } from '@/lib/bookshelf/recent-reading';

// 页面配置（与 Navigation 组件保持一致）
const pageConfig: Record<PageType, { label: string; icon: Component<any>; description: string }> = {
  bookshelf: { label: "书架", icon: BookshelfIcon, description: "管理你的书籍收藏" },
  scout: { label: "探索", icon: BookOpenIcon, description: "浏览书源发现分类与书籍" },
  sources: { label: "书源", icon: BookSourceIcon, description: "浏览和添加书源" },
  explore: { label: "发现", icon: BookSourceIcon, description: "书源发现分类书籍列表" },
  subscription: { label: "订阅", icon: SubscriptionIcon, description: "订阅更新" },
  bookmark: { label: "书签", icon: BookmarkIcon, description: "查看书签" },
  record: { label: "记录", icon: RecordIcon, description: "阅读记录" },
  settings: { label: "设置", icon: SettingsIcon, description: "应用设置" },
  "remote-book": { label: "远程书籍", icon: GlobeIcon, description: "浏览和导入远程书籍" },
  "text-viewer": { label: "阅读器", icon: BookmarkIcon, description: "文本阅读" },
  "image-viewer": { label: "漫画", icon: BookmarkIcon, description: "图片阅读" },
  "audio-viewer": { label: "音频", icon: BookmarkIcon, description: "音频播放" },
  "video-viewer": { label: "视频", icon: BookmarkIcon, description: "视频播放" },
  "file-viewer": { label: "文件", icon: BookmarkIcon, description: "文件阅读" },
  "book-info": { label: "书籍信息", icon: BookInfoIcon, description: "查看书籍详细信息" },
  "book-search": { label: "搜索", icon: BookOpenIcon, description: "搜索书架与全网书籍" },
  "bookshelf-cache": {
    label: "离线缓存",
    icon: BookshelfIcon,
    description: "批量缓存与导出正文",
  },
};

interface SideBarProps {
  currentPage?: PageType;
  onPageChange?: (page: PageType) => void;
  recentBooks?: RecentReadBook[];
  onOpenRecentBook?: (book: RecentReadBook) => void;
  /** 由 App 层 SidebarProvider 注入，避免独立页卸载后重挂载时丢失上下文 */
  sidebarState: Accessor<"expanded" | "collapsed">;
  onToggleSidebar: () => void;
  /** 是否为主壳顶栏留出 top 偏移（与 App 层 showTopNav 一致） */
  offsetTopAppBar?: boolean;
}

/** 侧栏可点击项：圆角矩形背景 + 选中时左侧主色竖条（避免与右侧徽标冲突） */
function sidebarNavButtonClass(active: boolean, extra?: string) {
  return cn(
    "relative overflow-hidden rounded-xl border-l-2 transition-colors duration-200",
    "text-sidebar-foreground/70 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-current",
    active ? "border-l-primary bg-primary/10! text-primary! font-semibold shadow-sm" : "border-l-transparent",
    !active && "hover:bg-primary/10 hover:text-primary hover:shadow-sm",
    extra
  );
}

export function SideBar(props: SideBarProps) {
  const currentPage = () => props.currentPage || "bookshelf";
  const recentBooks = () => props.recentBooks || [];

  // 处理页面切换
  function handlePageChange(page: PageType) {
    props.onPageChange?.(page);
  }

  // 所有菜单页面列表（包括设置）
  const allPages: PageType[] = [
    "bookshelf",
    "scout",
    "sources",
    "subscription",
    "bookmark",
    "record",
    "settings",
  ];

  // 判断是否收起
  const isCollapsed = () => props.sidebarState() === "collapsed";

  const isPageActive = (page: PageType) => currentPage() === page;

  return (
    <Sidebar
      collapsible="icon"
      class={cn(
        "bottom-0! h-auto! border-r border-sidebar-border",
        props.offsetTopAppBar
          ? "top-[calc(var(--app-bar-height)+var(--safe-area-top-effective))]!"
          : "top-0!",
      )}
    >
      <SidebarContent>
        {/* 主菜单 */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <For each={allPages}>
                {(page) => {
                  const config = pageConfig[page];
                  const active = () => isPageActive(page);
                  return (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={active()}
                        onClick={() => handlePageChange(page)}
                        tooltip={config.label}
                        class={sidebarNavButtonClass(
                          active(),
                          "group/menu-button h-10 group-data-[collapsible=icon]:justify-center"
                        )}
                      >
                        <span class="relative shrink-0 transition-colors duration-200 group-data-[collapsible=icon]:mx-auto">
                          <config.icon class="h-5 w-5" />
                          <Show when={page === 'bookshelf' && isCollapsed()}>
                            <BookshelfPendingUpdateNavBadge
                              variant="sidebar-collapsed"
                              class="absolute -top-1 -right-1 z-10"
                            />
                          </Show>
                        </span>
                        <span class="min-w-0 flex-1 truncate font-medium transition-colors duration-200 group-data-[collapsible=icon]:hidden">
                          {config.label}
                        </span>
                        <Show when={page === 'bookshelf' && !isCollapsed()}>
                          <BookshelfPendingUpdateNavBadge class="shrink-0" />
                        </Show>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }}
              </For>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* 最近读过：展开为列表，收起为封面快捷入口 */}
        <Show when={recentBooks().length > 0 || !isCollapsed()}>
          <>
            <Separator />
            <SidebarGroup>
              <SidebarGroupLabel
                class={cn(
                  "text-xs font-semibold text-sidebar-foreground/70",
                  isCollapsed() && "sr-only",
                  !isCollapsed() && "cursor-pointer hover:text-primary",
                )}
                onClick={() => !isCollapsed() && handlePageChange("record")}
              >
                最近读过
              </SidebarGroupLabel>
              <SidebarGroupContent class={cn(!isCollapsed() && "mt-3")}>
                <Show
                  when={recentBooks().length > 0}
                  fallback={
                    <Show when={!isCollapsed()}>
                      <p class="px-3 py-2 text-xs text-muted-foreground">尚无阅读记录</p>
                    </Show>
                  }
                >
                  <SidebarMenu>
                    <For each={recentBooks().slice(0, isCollapsed() ? 3 : 5)}>
                      {(book, index) => (
                        <>
                          <Show when={!isCollapsed() && index() > 0}>
                            <Separator class="my-1 h-0.3" />
                          </Show>
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              class={sidebarNavButtonClass(
                                false,
                                isCollapsed()
                                  ? "h-10 justify-center px-0"
                                  : "group/recent-item flex-col items-start gap-1 h-auto w-full py-2.5 px-3 text-left",
                              )}
                              tooltip={`${book.title} - ${book.chapterName}`}
                              onClick={() => props.onOpenRecentBook?.(book)}
                            >
                              <Show
                                when={isCollapsed()}
                                fallback={
                                  <>
                                    <span class="w-full min-w-0 truncate text-xs font-medium transition-colors duration-200">
                                      {book.title}
                                    </span>
                                    <span class="w-full min-w-0 truncate text-xs text-muted-foreground transition-colors duration-200 group-hover/recent-item:text-primary">
                                      {book.chapterName}
                                    </span>
                                  </>
                                }
                              >
                                <span class="mx-auto flex h-8 w-6 shrink-0 overflow-hidden rounded-sm border border-border/40 bg-muted">
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
          </>
        </Show>
      </SidebarContent>

      {/* 底部：收起/展开按钮 */}
      <SidebarFooter class="mt-auto shrink-0 border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => props.onToggleSidebar()}
              tooltip={isCollapsed() ? "展开侧边栏" : "收起侧边栏"}
              class={sidebarNavButtonClass(
                false,
                "group/toggle-button h-10 [&_svg]:size-4 group-data-[collapsible=icon]:justify-center"
              )}
            >
              <Show
                when={isCollapsed()}
                fallback={
                  <>
                    <ChevronLeftIcon class="h-4 w-4 transition-colors duration-200" size={16} />
                    <span class="font-medium transition-colors duration-200 group-data-[collapsible=icon]:hidden">
                      收起
                    </span>
                  </>
                }
              >
                <ChevronRightIcon
                  class="h-4 w-4 transition-colors duration-200 group-data-[collapsible=icon]:mx-auto"
                  size={16}
                />
              </Show>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

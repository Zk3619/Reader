import { For, Show, type Component } from "solid-js";
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
  useSidebar,
} from "./ui/sidebar";
import { Separator } from "./ui/separator";
import { cn } from "src/lib/utils";
import type { PageType } from "./Navigation";
import {
  BookshelfIcon,
  BookSourceIcon,
  SubscriptionIcon,
  BookmarkIcon,
  BookInfoIcon,
  RecordIcon,
  SettingsIcon,
  ImportIcon,
  GlobeIcon,
} from "./icons";

// 页面配置（与 Navigation 组件保持一致）
const pageConfig: Record<PageType, { label: string; icon: Component<any>; description: string }> = {
  bookshelf: { label: "书架", icon: BookshelfIcon, description: "管理你的书籍收藏" },
  sources: { label: "书源", icon: BookSourceIcon, description: "浏览和添加书源" },
  discover: { label: "发现", icon: BookSourceIcon, description: "发现页分类" },
  subscription: { label: "订阅", icon: SubscriptionIcon, description: "订阅更新" },
  bookmark: { label: "书签", icon: BookmarkIcon, description: "查看书签" },
  record: { label: "记录", icon: RecordIcon, description: "阅读记录" },
  settings: { label: "设置", icon: SettingsIcon, description: "应用设置" },
  import: { label: "导入", icon: ImportIcon, description: "批量导入本地书籍" },
  "remote-book": { label: "远程书籍", icon: GlobeIcon, description: "浏览和导入远程书籍" },
  reader: { label: "阅读器", icon: BookmarkIcon, description: "阅读书籍" },
  "book-info": { label: "书籍信息", icon: BookInfoIcon, description: "查看书籍详细信息" },
};

// 最近读过的书籍类型
interface RecentBook {
  id: number;
  title: string;
  chapterName: string;
}

interface SideBarProps {
  currentPage?: PageType;
  onPageChange?: (page: PageType) => void;
  recentBooks?: RecentBook[];
}

export function SideBar(props: SideBarProps) {
  const currentPage = () => props.currentPage || "bookshelf";
  const recentBooks = () => props.recentBooks || [];
  const { toggleSidebar, state } = useSidebar();

  // 处理页面切换
  function handlePageChange(page: PageType) {
    props.onPageChange?.(page);
  }

  // 所有菜单页面列表（包括设置）
  const allPages: PageType[] = ["bookshelf", "sources", "subscription", "bookmark", "record", "settings"];
  
  // 判断是否收起
  const isCollapsed = () => state() === "collapsed";

  return (
    <Sidebar
      collapsible="icon" 
      class="h-[calc(100vh-3.5rem)] top-14 bottom-0 border-r border-sidebar-border"
      style={{
        "--sidebar-width-icon": "3rem"
      }}
    >
      <SidebarContent class="h-full overflow-y-auto">
        {/* 主菜单 */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <For each={allPages}>
                {(page) => {
                  const config = pageConfig[page];
                  return (
                    <>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={currentPage() === page}
                          onClick={() => handlePageChange(page)}
                          tooltip={config.label}
                          class={cn(
                            "group/menu-button relative rounded-lg transition-all duration-200 h-10",
                            "group-data-[collapsible=icon]:justify-center",
                            currentPage() !== page && "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-md hover:translate-x-1",
                            "active:scale-[0.98]",
                            currentPage() === page && "bg-sidebar-accent! text-sidebar-accent-foreground! shadow-lg ring-2 ring-primary/50 ring-offset-2 ring-offset-sidebar font-semibold"
                          )}
                        >
                          <span class={cn(
                            "transition-transform duration-200 group-data-[collapsible=icon]:mx-auto",
                            "group-hover/menu-button:scale-110",
                            currentPage() === page && "scale-110"
                          )}>
                            <config.icon class="h-5 w-5" />
                          </span>
                          <span class={cn("font-medium group-data-[collapsible=icon]:hidden", currentPage() === page && "font-semibold")}>
                            {config.label}
                          </span>
                          <Show when={currentPage() === page}>
                            <span class="absolute right-2 h-2 w-2 rounded-full bg-primary shadow-sm group-data-[collapsible=icon]:hidden" />
                          </Show>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <Separator class="my-1.5 h-0.3" />
                    </>
                  );
                }}
              </For>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* 分割线和最近读过 - 移动到设置下面，收起时不显示 */}
        <Show when={recentBooks().length > 0 && !isCollapsed()}>
          <SidebarGroup>
            <SidebarGroupLabel class="text-xs font-semibold text-sidebar-foreground/70">
              最近读过
            </SidebarGroupLabel>
            <SidebarGroupContent class="mt-3">
              <SidebarMenu>
                <For each={recentBooks().slice(0, 5)}>
                  {(book, index) => (
                    <>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          variant="outline"
                          class={cn(
                            "flex-col items-start gap-1 h-auto py-2.5 px-3 rounded-lg",
                            "transition-all duration-200",
                            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-md hover:border-sidebar-accent",
                            "active:scale-[0.98]",
                            "group"
                          )}
                          tooltip={`${book.title} - ${book.chapterName}`}
                        >
                          <span class="w-full min-w-0 truncate text-xs font-medium group-hover:text-sidebar-accent-foreground transition-colors">
                            {book.title}
                          </span>
                          <span class="w-full min-w-0 truncate text-xs text-muted-foreground group-hover:text-sidebar-accent-foreground/90 transition-colors">
                            {book.chapterName}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {/* 在最后一项之前不添加分割线 */}
                      <Show when={index() < Math.min(recentBooks().length, 5) - 1}>
                        <Separator class="my-1.5 h-0.3" />
                      </Show>
                    </>
                  )}
                </For>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </Show>
      </SidebarContent>

      {/* 底部：收起/展开按钮 */}
      <SidebarFooter>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={toggleSidebar}
            tooltip={isCollapsed() ? "展开侧边栏" : "收起侧边栏"}
            class={cn(
              "group/toggle-button relative rounded-lg transition-all duration-200 h-10",
              "group-data-[collapsible=icon]:justify-center",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-md",
              "active:scale-[0.98]"
            )}
          >
            <Show
              when={isCollapsed()}
              fallback={
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="h-4 w-4 transition-transform duration-200 group-hover/toggle-button:scale-110"
                  >
                    <path d="M18 18l-6-6 6-6" />
                  </svg>
                  <span class="font-medium group-data-[collapsible=icon]:hidden">收起</span>
                </>
              }
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="h-4 w-4 transition-transform duration-200 group-hover/toggle-button:scale-110 group-data-[collapsible=icon]:mx-auto"
              >
                <path d="M10 18l6-6-6-6" />
              </svg>
            </Show>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarFooter>
    </Sidebar>
  );
}

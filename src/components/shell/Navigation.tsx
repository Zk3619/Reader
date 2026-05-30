import { For, Show, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import logoLight from "@/assets/logo-l-512x512.png";
import logoDark from "@/assets/logo-d-512x512.png";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  NavigationMenuLabel,
  NavigationMenuDescription,
  NavigationMenuIcon,
} from "@/components/ui/navigation-menu";
import { ThemeSwitch } from "@/components/shell/ThemeSwitch";
import { WindowControlButtons } from "@/components/shell/WindowControlButtons";
import { getEffectiveDark } from "@/lib/theme";
import { settingsStore } from "@/stores/settings";
import { cn } from "@/lib/utils";
import { BookshelfPendingUpdateNavBadge } from "@/components/bookshelf/BookshelfPendingUpdateBadge";
import { useShellLayout } from "@/components/shell/ShellLayoutProvider";
import {
  BookshelfIcon,
  BookSourceIcon,
  SubscriptionIcon,
  BookmarkIcon,
  RecordIcon,
  SettingsIcon,
  GlobeIcon,
  BookInfoIcon,
  BookOpenIcon,
} from "@/components/shared/icons";

export type PageType =
  | "bookshelf"
  | "bookshelf-cache"
  | "book-search"
  | "scout"
  | "sources"
  | "explore"
  | "subscription"
  | "bookmark"
  | "record"
  | "settings"
  | "remote-book"
  | "text-viewer"
  | "image-viewer"
  | "audio-viewer"
  | "video-viewer"
  | "file-viewer"
  | "book-info";

interface NavigationProps {
  currentPage?: PageType;
  onPageChange?: (page: PageType) => void;
}

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
  "text-viewer": { label: "文本", icon: BookmarkIcon, description: "文本阅读" },
  "image-viewer": { label: "漫画", icon: BookmarkIcon, description: "图片阅读" },
  "audio-viewer": { label: "听书", icon: BookmarkIcon, description: "音频播放" },
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

/** 不出现在顶栏页面菜单；与 App.tsx 的 STANDALONE_PAGES（布局/挂载）无关 */
const NAV_HIDDEN_PAGES: PageType[] = [
  "explore",
  "remote-book",
  "text-viewer",
  "image-viewer",
  "audio-viewer",
  "video-viewer",
  "file-viewer",
  "book-info",
  "book-search",
  "bookshelf-cache",
];

const NAV_MENU_PAGES = Object.entries(pageConfig).filter(
  ([page]) => !NAV_HIDDEN_PAGES.includes(page as PageType)
);

function CurrentPageIcon(props: { page: PageType; class?: string }) {
  const icon = () => pageConfig[props.page].icon;
  return <Dynamic component={icon()} class={cn("h-4 w-4 shrink-0", props.class)} />;
}

export function Navigation(props: NavigationProps) {
  const shell = useShellLayout();
  const isDark = () => getEffectiveDark(settingsStore.state.app.theme);
  const currentPage = () => props.currentPage || "bookshelf";
  /** 侧栏未挂载时（移动壳层或宽度不足）在顶栏显示等待更新徽标 */
  const showNavPendingBadge = () => !shell().showSidebar;

  function handlePageChange(page: PageType) {
    props.onPageChange?.(page);
  }

  return (
    <header
      data-tauri-drag-region
      class={cn(
        "w-full border-b border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/95",
        "safe-area-inset-top"
      )}
    >
      <div class="flex h-14 items-center justify-between gap-2 px-3 sm:px-4">
        <div class="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div class="flex shrink-0 items-center gap-2">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shadow-sm transition-colors dark:bg-primary/20">
              <img
                src={isDark() ? logoDark : logoLight}
                alt="阅读"
                class="h-6 w-6 transition-opacity duration-300"
              />
            </div>
            <span class="text-sm font-semibold text-foreground">阅读</span>
          </div>

          <NavigationMenu class="min-w-0 flex-1">
              <NavigationMenuItem>
                <NavigationMenuTrigger class="h-9 max-w-full gap-1.5 px-3 text-sm font-medium">
                  <CurrentPageIcon page={currentPage()} class="shrink-0" />
                  <span class="min-w-0 truncate">{pageConfig[currentPage()].label}</span>
                  <Show when={showNavPendingBadge() && currentPage() === "bookshelf"}>
                    <BookshelfPendingUpdateNavBadge class="shrink-0" />
                  </Show>
                  <NavigationMenuIcon />
                </NavigationMenuTrigger>
                <NavigationMenuContent class="p-0">
                  <div class="grid max-h-[80dvh] w-[min(100dvw-2rem,240px)] min-w-0 gap-2 overflow-y-auto scroll-gutter-stable-both p-3 md:w-[480px] md:grid-cols-2 lg:w-[520px]">
                    <For each={NAV_MENU_PAGES}>
                      {([page, config]) => (
                        <NavigationMenuLink
                          as="button"
                          onClick={() => handlePageChange(page as PageType)}
                          class={cn(
                            "flex w-full min-h-12 min-w-0 select-none items-center gap-3 rounded-md p-2.5 text-left leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                            currentPage() === page && "bg-accent/50"
                          )}
                        >
                          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/50">
                            {(() => {
                              const Icon = config.icon;
                              return <Icon class="h-4 w-4" />;
                            })()}
                          </div>
                          <div class="min-w-0 flex-1 space-y-0.5 py-0.5">
                            <div class="flex min-w-0 items-center gap-1.5">
                              <NavigationMenuLabel class="block min-w-0 flex-1 truncate text-sm font-medium">
                                {config.label}
                              </NavigationMenuLabel>
                              <Show when={showNavPendingBadge() && page === "bookshelf"}>
                                <BookshelfPendingUpdateNavBadge class="shrink-0" />
                              </Show>
                            </div>
                            <NavigationMenuDescription class="block truncate text-xs leading-snug text-muted-foreground">
                              {config.description}
                            </NavigationMenuDescription>
                          </div>
                        </NavigationMenuLink>
                      )}
                    </For>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenu>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <ThemeSwitch withTooltip />
          <WindowControlButtons />
        </div>
      </div>
    </header>
  );
}

import { createSignal, Show, For, onMount, onCleanup, createEffect, type Component } from "solid-js";
import { withBlurBefore, blurActiveElement } from "@/utils/accessibility";
import logoLight from "../assets/logo-l-512x512.png";
import logoDark from "../assets/logo-d-512x512.png";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  NavigationMenuLabel,
  NavigationMenuDescription,
  NavigationMenuIcon,
} from "./ui/navigation-menu";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { ThemeSwitch } from "./ThemeSwitch";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  BookshelfIcon,
  BookSourceIcon,
  SubscriptionIcon,
  BookmarkIcon,
  BookInfoIcon,
  RecordIcon,
  SettingsIcon,
  StarIcon,
  SearchIcon,
  MoreIcon,
  RefreshIcon,
  FolderPlusIcon,
  GlobeIcon,
  LinkIcon,
  Settings2Icon,
  LayoutIcon,
  FolderTreeIcon,
  DownloadIcon,
  UploadIcon,
  ImportIcon,
  FileTextIcon,
  QrCodeIcon,
} from "./icons";
import { BookshelfLayoutDialog } from "./BookshelfLayoutDialog";
import { WindowControlButtons } from "./WindowControlButtons";
import { isTauri, isMobile } from "@/lib/platform/detect";
import { getEffectiveDark } from "@/lib/theme";
import { settingsStore } from "@/stores/settings";
import {
  getSourceGroupLabel,
  isSourceFilterOrAll,
  SOURCE_FILTER_ENABLED,
  SOURCE_FILTER_DISABLED,
  SOURCE_FILTER_NEED_LOGIN,
  SOURCE_FILTER_UNGROUPED,
  SOURCE_FILTER_DISCOVER_ENABLED,
  SOURCE_FILTER_DISCOVER_DISABLED,
} from "@/lib/sources-filters";
import { Checkbox } from "./ui/checkbox";
import { cn } from "src/lib/utils";
import type { GroupStyle } from "@/stores/bookshelf-layout";
import type { BookGroup } from "@/types";
import { getCoverPreviewInfo } from "@/utils/book-group-cover";

export type PageType = "bookshelf" | "sources" | "discover" | "subscription" | "bookmark" | "record" | "settings" | "import" | "remote-book" | "reader" | "book-info";

interface NavigationProps {
  currentPage?: PageType;
  groupName?: string;
  /** 分组样式：常规 / 下拉框 / 标签 */
  groupStyle?: GroupStyle;
  /** 可见分组列表（下拉框/标签时使用） */
  groups?: BookGroup[];
  /** 各分组书籍数量（下拉框描述用） */
  groupBookCounts?: Record<number, number>;
  /** 当前选中的分组 ID */
  currentGroupId?: number;
  /** 切换分组（下拉框/标签时使用） */
  onGroupChange?: (groupId: number) => void;
  /** 常规模式下从「具体分组书籍」返回「分组页」 */
  onBackToGroupList?: () => void;
  onPageChange?: (page: PageType) => void;
  onOpenGroupManage?: () => void;
  /** 添加本地书籍（更多 → 添加本地） */
  onImportLocal?: () => void;
  /** 通过 URL 添加书籍（更多 → 添加网址） */
  onAddBookByUrl?: () => void;
  /** 书源页：分组列表（供下拉显示） */
  sourceGroups?: string[];
  /** 书源页：当前选中的分组（null = 全部） */
  currentSourceGroup?: string | null;
  /** 书源页：切换分组 */
  onSourceGroupChange?: (group: string | null) => void;
  /** 书源页更多：新建书源 */
  onSourcesNew?: () => void;
  /** 书源页更多：本地导入 */
  onSourcesImportLocal?: () => void;
  /** 书源页更多：网络导入 */
  onSourcesImportNetwork?: () => void;
  /** 书源页更多：二维码导入（仅移动端显示） */
  onSourcesImportQR?: () => void;
  /** 是否显示「二维码导入」菜单项（移动端为 true） */
  showSourcesImportQR?: boolean;
  /** 为 true 时不显示页面切换菜单（例如窄屏已显示 BottomBar 时） */
  hidePageMenu?: boolean;
  /** 书源页：是否按分组名分块显示（仅全部/筛选时有效） */
  sourcesGroupByGroupName?: boolean;
  /** 书源页：打开分组管理对话框 */
  onOpenSourceGroupManage?: () => void;
  /** 书源页：切换「按分组名显示」 */
  onSourcesGroupByGroupNameChange?: (value: boolean) => void;
  /** 书源页：搜索关键词（导航栏扩展输入框） */
  sourceSearchQuery?: string;
  /** 书源页：搜索关键词变化 */
  onSourceSearchQueryChange?: (query: string) => void;
  /** 书源页：搜索模式（name / fuzzy / extended），模糊与扩展互斥 */
  sourceSearchMode?: import('@/lib/sources-filters').SourceSearchMode;
  /** 书源页：切换搜索模式 */
  onSourceSearchModeChange?: (mode: import('@/lib/sources-filters').SourceSearchMode) => void;
}

// 页面配置
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
  reader: { label: "阅读器", icon: BookmarkIcon, description: "阅读书籍" }, // reader 页面通常不显示在导航中，但需要配置以避免类型错误
  "book-info": { label: "书籍信息", icon: BookInfoIcon, description: "查看书籍详细信息" }, // book-info 页面通常不显示在导航中，但需要配置以避免类型错误
};

// 独立页面列表：这些页面不显示应用级导航栏，采用独立页面设计（类似阅读器）
const STANDALONE_PAGES: PageType[] = ["import", "remote-book", "reader", "discover", "book-info"];

/** 分组下拉项左侧封面缩略图（与页面切换项左侧图标同尺寸：w-8 h-8） */
function GroupCoverThumb(props: { group: BookGroup }) {
  const [imageError, setImageError] = createSignal(false);
  const info = () => getCoverPreviewInfo(props.group.cover);
  return (
    <div class="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted/50" aria-hidden>
      {(() => {
        const inf = info();
        const failed = imageError();
        if (!props.group.cover?.trim() || inf.type === "invalid" || (inf.url && failed)) {
          return (
            <span class="flex h-full w-full items-center justify-center text-muted-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <path d="M8 7h3" />
                <path d="M8 11h6" />
              </svg>
            </span>
          );
        }
        if (inf.type === "emoji" && props.group.cover) {
          return <span class="flex h-full w-full items-center justify-center text-sm">{props.group.cover.trim()}</span>;
        }
        if (inf.url && !failed) {
          return (
            <img
              src={inf.url}
              alt=""
              class="h-full w-full object-cover"
              onError={() => setImageError(true)}
            />
          );
        }
        return (
          <span class="flex h-full w-full items-center justify-center text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <path d="M8 7h3" />
              <path d="M8 11h6" />
            </svg>
          </span>
        );
      })()}
    </div>
  );
}

export function Navigation(props: NavigationProps) {
  const [isDesktop, setIsDesktop] = createSignal(false);
  const [showBookshelfLayoutDialog, setShowBookshelfLayoutDialog] = createSignal(false);
  const isDark = () => getEffectiveDark(settingsStore.state.app.theme);
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);
  const [sourceSearchExpanded, setSourceSearchExpanded] = createSignal(false);
  const [tabsScrollRef, setTabsScrollRef] = createSignal<HTMLDivElement | undefined>(undefined);
  /** 缓存搜索关键词，供 onBlur 等事件回调读取，避免在无 owner 的回调里读 props 触发 "computations outside createRoot" */
  const sourceSearchQueryRef: { current: string } = { current: "" };
  sourceSearchQueryRef.current = props.sourceSearchQuery ?? "";
  /** 缓存搜索模式，供 onSelect 等事件回调读取，避免在无 owner 的回调里读 props */
  const sourceSearchModeRef: { current: import('@/lib/sources-filters').SourceSearchMode } = { current: 'name' };
  sourceSearchModeRef.current = props.sourceSearchMode ?? 'name';
  createEffect(() => {
    if (currentPage() !== "sources") {
      setSourceSearchExpanded(false);
      return;
    }
    if ((props.sourceSearchQuery ?? "").trim()) setSourceSearchExpanded(true);
  });
  const currentPage = () => props.currentPage || "bookshelf";
  const groupName = () => props.groupName || "";

  // 分组标签：竖向滚轮转为横向滚动（需 passive: false 才能阻止默认竖向滚动）
  createEffect(() => {
    const style = props.groupStyle;
    const el = tabsScrollRef();
    if (style !== "tabs" || !el) return;
    const handler = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", handler, { passive: false });
    onCleanup(() => el.removeEventListener("wheel", handler));
  });

  // 监听对话框打开事件，关闭下拉菜单
  onMount(() => {
    // 监听全局对话框打开事件，关闭下拉菜单
    const handleDialogOpened = () => {
      setMoreMenuOpen(false);
      blurActiveElement();
    };
    
    window.addEventListener('dialog-opened', handleDialogOpened);
    
    return () => {
      window.removeEventListener('dialog-opened', handleDialogOpened);
    };
  });

  // 检测是否为桌面端和 Tauri 环境
  onMount(async () => {
    // 检测窗口宽度（窄屏判定宽度为480px）
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 480);
    };
    checkDesktop();
    window.addEventListener("resize", checkDesktop);

    return () => {
      window.removeEventListener("resize", checkDesktop);
    };
  });

  // 处理页面切换
  function handlePageChange(page: PageType) {
    props.onPageChange?.(page);
  }

  return (
    <header
      data-tauri-drag-region
      class={cn(
        'w-full border-b border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/95',
        'safe-area-inset-top'
      )}
    >
      <div class="flex h-14 items-center justify-between px-4">
        {/* 左侧：Logo 和主菜单 */}
        <div class="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          {/* Logo - 仅在宽屏显示 */}
          <Show when={isDesktop()}>
            <div class="flex shrink-0 items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20 shadow-sm transition-colors">
                <img 
                  src={isDark() ? logoDark : logoLight} 
                  alt="阅读" 
                  class="h-6 w-6 transition-opacity duration-300" 
                />
              </div>
              <span class="hidden text-sm font-semibold text-foreground lg:inline">阅读</span>
            </div>
          </Show>

          {/* 主菜单导航（窄屏显示 BottomBar 时不显示）；书源页下不占 flex-1，让分组下拉撑满剩余宽度 */}
          <Show when={!props.hidePageMenu}>
            <NavigationMenu class={cn("min-w-0", currentPage() === "sources" ? "shrink-0" : "flex-1")}>
              <NavigationMenuItem>
                <NavigationMenuTrigger
                  class={cn(
                    "h-9 px-3 text-sm font-medium",
                    !isDesktop() && "px-2"
                  )}
                >
                  {(() => {
                    const Icon = pageConfig[currentPage()].icon;
                    return <Icon class="mr-1 h-4 w-4" />;
                  })()}
                  <span class={cn(!isDesktop() && "hidden")}>
                    {pageConfig[currentPage()].label}
                  </span>
                  <NavigationMenuIcon />
                </NavigationMenuTrigger>
                <NavigationMenuContent class="p-0">
                  <div class="grid w-[240px] gap-2 p-3 min-w-0 md:w-[480px] md:grid-cols-2 lg:w-[520px] max-h-[80vh] overflow-y-auto">
                    <For each={Object.entries(pageConfig).filter(([page]) => !STANDALONE_PAGES.includes(page as PageType))}>
                      {([page, config]) => (
                        <NavigationMenuLink
                          as="button"
                          onClick={() => handlePageChange(page as PageType)}
                          class={cn(
                            "flex w-full min-w-0 select-none items-center gap-3 rounded-md p-2.5 min-h-12 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-left",
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
                            <NavigationMenuLabel class="block text-sm font-medium truncate">
                              {config.label}
                            </NavigationMenuLabel>
                            <NavigationMenuDescription class="block text-xs leading-snug text-muted-foreground truncate">
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
          </Show>

          {/* 书源页：分组下拉（默认撑满剩余宽度，空间不足时响应式缩小，分组名过长省略号） */}
          <Show when={currentPage() === "sources"}>
            <div class="min-w-0 flex-1 overflow-hidden flex max-w-full basis-0">
              <NavigationMenu class="w-full! min-w-0 max-w-full flex-1! [&>li]:min-w-0 [&>li]:w-full! [&>li]:max-w-full!">
                <NavigationMenuItem>
                  <NavigationMenuTrigger
                    class={cn(
                      "h-9 w-full min-w-0 max-w-full grid grid-cols-[1fr_auto] items-center gap-1.5 px-3 text-sm font-medium overflow-hidden",
                      !isDesktop() && "px-2"
                    )}
                  >
                    <span
                      class="min-w-0 text-left"
                      style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                    >
                      {getSourceGroupLabel(props.currentSourceGroup ?? null)}
                    </span>
                    <span class="flex items-center">
                      <NavigationMenuIcon />
                    </span>
                  </NavigationMenuTrigger>
                <NavigationMenuContent class="p-0 w-52 min-w-52 max-w-52 overflow-hidden">
                  <div class="flex w-full min-w-0 flex-col gap-2 p-3 max-h-[80vh] overflow-y-auto overflow-x-hidden">
                    <NavigationMenuLink
                      as="button"
                      onClick={() => props.onSourceGroupChange?.(null)}
                      class={cn(
                        "flex w-full min-w-0 select-none items-center gap-3 rounded-md p-2.5 min-h-12 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-left overflow-hidden",
                        (props.currentSourceGroup == null || props.currentSourceGroup === "") && "bg-accent/50"
                      )}
                    >
                      <NavigationMenuLabel class="block min-w-0 flex-1 truncate text-sm font-medium">全部</NavigationMenuLabel>
                    </NavigationMenuLink>
                    <NavigationMenuLink
                      as="button"
                      onClick={() => props.onSourceGroupChange?.(SOURCE_FILTER_ENABLED)}
                      class={cn(
                        "flex w-full min-w-0 select-none items-center gap-3 rounded-md p-2.5 min-h-12 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-left overflow-hidden",
                        props.currentSourceGroup === SOURCE_FILTER_ENABLED && "bg-accent/50"
                      )}
                    >
                      <NavigationMenuLabel class="block min-w-0 flex-1 truncate text-sm font-medium">已启用</NavigationMenuLabel>
                    </NavigationMenuLink>
                    <NavigationMenuLink
                      as="button"
                      onClick={() => props.onSourceGroupChange?.(SOURCE_FILTER_DISABLED)}
                      class={cn(
                        "flex w-full min-w-0 select-none items-center gap-3 rounded-md p-2.5 min-h-12 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-left overflow-hidden",
                        props.currentSourceGroup === SOURCE_FILTER_DISABLED && "bg-accent/50"
                      )}
                    >
                      <NavigationMenuLabel class="block min-w-0 flex-1 truncate text-sm font-medium">已禁用</NavigationMenuLabel>
                    </NavigationMenuLink>
                    <NavigationMenuLink
                      as="button"
                      onClick={() => props.onSourceGroupChange?.(SOURCE_FILTER_NEED_LOGIN)}
                      class={cn(
                        "flex w-full min-w-0 select-none items-center gap-3 rounded-md p-2.5 min-h-12 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-left overflow-hidden",
                        props.currentSourceGroup === SOURCE_FILTER_NEED_LOGIN && "bg-accent/50"
                      )}
                    >
                      <NavigationMenuLabel class="block min-w-0 flex-1 truncate text-sm font-medium">需要登录</NavigationMenuLabel>
                    </NavigationMenuLink>
                    <NavigationMenuLink
                      as="button"
                      onClick={() => props.onSourceGroupChange?.(SOURCE_FILTER_UNGROUPED)}
                      class={cn(
                        "flex w-full min-w-0 select-none items-center gap-3 rounded-md p-2.5 min-h-12 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-left overflow-hidden",
                        props.currentSourceGroup === SOURCE_FILTER_UNGROUPED && "bg-accent/50"
                      )}
                    >
                      <NavigationMenuLabel class="block min-w-0 flex-1 truncate text-sm font-medium">未分组</NavigationMenuLabel>
                    </NavigationMenuLink>
                    <NavigationMenuLink
                      as="button"
                      onClick={() => props.onSourceGroupChange?.(SOURCE_FILTER_DISCOVER_ENABLED)}
                      class={cn(
                        "flex w-full min-w-0 select-none items-center gap-3 rounded-md p-2.5 min-h-12 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-left overflow-hidden",
                        props.currentSourceGroup === SOURCE_FILTER_DISCOVER_ENABLED && "bg-accent/50"
                      )}
                    >
                      <NavigationMenuLabel class="block min-w-0 flex-1 truncate text-sm font-medium">已启用发现</NavigationMenuLabel>
                    </NavigationMenuLink>
                    <NavigationMenuLink
                      as="button"
                      onClick={() => props.onSourceGroupChange?.(SOURCE_FILTER_DISCOVER_DISABLED)}
                      class={cn(
                        "flex w-full min-w-0 select-none items-center gap-3 rounded-md p-2.5 min-h-12 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-left overflow-hidden",
                        props.currentSourceGroup === SOURCE_FILTER_DISCOVER_DISABLED && "bg-accent/50"
                      )}
                    >
                      <NavigationMenuLabel class="block min-w-0 flex-1 truncate text-sm font-medium">已禁用发现</NavigationMenuLabel>
                    </NavigationMenuLink>
                    <For each={props.sourceGroups ?? []}>
                      {(groupName) => (
                        <NavigationMenuLink
                          as="button"
                          onClick={() => props.onSourceGroupChange?.(groupName)}
                          class={cn(
                            "flex w-full min-w-0 select-none items-center gap-3 rounded-md p-2.5 min-h-12 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-left overflow-hidden",
                            props.currentSourceGroup === groupName && "bg-accent/50"
                          )}
                        >
                          <NavigationMenuLabel class="block min-w-0 flex-1 truncate text-sm font-medium" title={groupName}>
                            {groupName}
                          </NavigationMenuLabel>
                        </NavigationMenuLink>
                      )}
                    </For>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenu>
            </div>
          </Show>
          {/* 分组：常规=分组名（可点击返回分组页）；下拉框=与页面切换一致的下拉；标签=横向滚动菜单 */}
          <Show when={currentPage() === "bookshelf" && currentPage() !== "settings"}>
            <Show when={props.groupStyle === "normal"}>
              <div class="min-w-0 flex items-center gap-2 text-sm text-muted-foreground">
                <Show
                  when={props.onBackToGroupList}
                  fallback={<span class="truncate" title={groupName()}>{groupName()}</span>}
                >
                  <button
                    type="button"
                    onClick={() => props.onBackToGroupList?.()}
                    class="truncate text-left hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded px-1 -mx-1"
                    title={groupName()}
                  >
                    {groupName()}
                  </button>
                </Show>
              </div>
            </Show>
            <Show when={props.groupStyle === "dropdown" && props.groups && props.groups.length > 0}>
              <NavigationMenu class="min-w-0">
                <NavigationMenuItem>
                  <NavigationMenuTrigger
                    class={cn(
                      "h-9 px-3 text-sm font-medium min-w-0 max-w-[180px]",
                      !isDesktop() && "px-2"
                    )}
                  >
                    <span class="truncate">
                      {props.currentGroupId === -1 || props.currentGroupId == null
                        ? "全部"
                        : (props.groups ?? []).find((g) => g.groupId === props.currentGroupId)?.groupName ?? "全部"}
                    </span>
                    <NavigationMenuIcon />
                  </NavigationMenuTrigger>
                  <NavigationMenuContent class="p-0">
                    <div class="grid w-[200px] min-w-0 gap-2 p-3 max-h-[80vh] overflow-y-auto">
                      <For each={props.groups}>
                        {(g) => (
                          <NavigationMenuLink
                            as="button"
                            onClick={() => props.onGroupChange?.(g.groupId)}
                            class={cn(
                              "flex w-full min-w-0 select-none items-center gap-3 rounded-md p-2.5 min-h-12 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-left",
                              props.currentGroupId === g.groupId && "bg-accent/50"
                            )}
                          >
                            <GroupCoverThumb group={g} />
                            <div class="min-w-0 flex-1 space-y-0.5 py-0.5">
                              <NavigationMenuLabel class="block text-sm font-medium truncate">{g.groupName}</NavigationMenuLabel>
                              <NavigationMenuDescription class="block text-xs leading-snug text-muted-foreground truncate">
                                {props.groupBookCounts?.[g.groupId] ?? 0} 本书
                              </NavigationMenuDescription>
                            </div>
                          </NavigationMenuLink>
                        )}
                      </For>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenu>
            </Show>
            <Show when={props.groupStyle === "tabs" && props.groups && props.groups.length > 0}>
              <div
                ref={setTabsScrollRef}
                class="flex flex-1 min-w-0 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent [scrollbar-gutter:stable]"
              >
                <div class="flex items-center gap-1 shrink-0 py-1 min-w-max">
                  <For each={props.groups}>
                    {(g) => (
                      <button
                        type="button"
                        onClick={() => props.onGroupChange?.(g.groupId)}
                        class={cn(
                          "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
                          props.currentGroupId === g.groupId
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        )}
                      >
                        {g.groupName}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
          {/* 非书架页时仍显示分组名占位（如之前行为） */}
          <Show when={currentPage() !== "bookshelf" && groupName() && currentPage() !== "settings"}>
            <div class="min-w-0 flex items-center gap-2 text-sm text-muted-foreground">
              <span class="truncate" title={groupName()}>{groupName()}</span>
            </div>
          </Show>
        </div>

        {/* 右侧：操作按钮和窗口控制（搜索置前，参照 legado） */}
        <div class="flex shrink-0 items-center gap-1">
          {/* 搜索：书源页为可扩展输入框，其余页面为按钮 */}
          <Show when={
            currentPage() !== "bookmark" && 
            currentPage() !== "record" && 
            currentPage() !== "settings"
          }>
            <Show
              when={currentPage() === "sources" && sourceSearchExpanded()}
              fallback={
                <Tooltip>
                  <TooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9 shrink-0" onClick={() => currentPage() === "sources" && setSourceSearchExpanded(true)}>
                    <SearchIcon class="h-4 w-4" />
                    <span class="sr-only">搜索</span>
                  </TooltipTrigger>
                  <TooltipContent>搜索</TooltipContent>
                </Tooltip>
              }
            >
              <div class="no-drag relative flex h-9 w-40 sm:w-52 items-center rounded-md border border-input bg-transparent text-sm transition-[width]">
                <SearchIcon class="absolute left-2.5 h-4 w-4 shrink-0 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="搜索书源"
                  value={props.sourceSearchQuery ?? ""}
                  onInput={(e) => {
                    const v = e.currentTarget.value;
                    sourceSearchQueryRef.current = v;
                    props.onSourceSearchQueryChange?.(v);
                  }}
                  onBlur={() => { if (!sourceSearchQueryRef.current.trim()) setSourceSearchExpanded(false); }}
                  class="h-full w-full flex-1 bg-transparent pl-9 pr-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none rounded-md"
                  aria-label="搜索书源"
                />
              </div>
            </Show>
          </Show>

          {/* 收藏按钮 - 某些页面不显示 */}
          <Show when={
            currentPage() !== "bookmark" && 
            currentPage() !== "record" && 
            currentPage() !== "settings"
          }>
            <Tooltip>
              <TooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9">
                <StarIcon class="h-4 w-4" />
                <span class="sr-only">收藏</span>
              </TooltipTrigger>
              <TooltipContent>收藏</TooltipContent>
            </Tooltip>
          </Show>

          {/* 更多按钮 - 设置页面不显示 */}
          <Show when={currentPage() !== "settings"}>
            <DropdownMenu open={moreMenuOpen()} onOpenChange={setMoreMenuOpen}>
              <Tooltip>
                <TooltipTrigger as="div">
                  <DropdownMenuTrigger
                    as={(props: any) => (
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-9 w-9"
                        onClick={withBlurBefore(props.onClick)}
                        {...props}
                      >
                        <MoreIcon class="h-4 w-4" />
                        <span class="sr-only">更多</span>
                      </Button>
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent>更多</TooltipContent>
              </Tooltip>
              <DropdownMenuContent class="min-w-0 w-auto">
                {/* 书架页面的菜单项 */}
                <Show when={currentPage() === "bookshelf"}>
                  <DropdownMenuItem>
                    <RefreshIcon class="h-4 w-4" />
                    <span>更新目录</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMoreMenuOpen(false);
                      blurActiveElement();
                      props.onImportLocal?.();
                    }}
                  >
                    <FolderPlusIcon class="h-4 w-4" />
                    <span>添加本地</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMoreMenuOpen(false);
                      blurActiveElement();
                      props.onPageChange?.("remote-book");
                    }}
                  >
                    <GlobeIcon class="h-4 w-4" />
                    <span>远程书籍</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMoreMenuOpen(false);
                      blurActiveElement();
                      props.onAddBookByUrl?.();
                    }}
                  >
                    <LinkIcon class="h-4 w-4" />
                    <span>添加网址</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Settings2Icon class="h-4 w-4" />
                    <span>书架管理</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      // 先关闭 DropdownMenu 并移除焦点，避免 aria-hidden 警告
                      setMoreMenuOpen(false);
                      blurActiveElement();
                      // 然后打开对话框
                      setShowBookshelfLayoutDialog(true);
                    }}
                  >
                    <LayoutIcon class="h-4 w-4" />
                    <span>书架布局</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      // 先关闭 DropdownMenu 并移除焦点，避免 aria-hidden 警告
                      setMoreMenuOpen(false);
                      blurActiveElement();
                      // 然后打开分组管理
                      props.onOpenGroupManage?.();
                    }}
                  >
                    <FolderTreeIcon class="h-4 w-4" />
                    <span>分组管理</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <DownloadIcon class="h-4 w-4" />
                    <span>缓存导出</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <UploadIcon class="h-4 w-4" />
                    <span>导出书单</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <ImportIcon class="h-4 w-4" />
                    <span>导入书单</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <FileTextIcon class="h-4 w-4" />
                    <span>查看日志</span>
                  </DropdownMenuItem>
                </Show>
                {/* 书源页面的菜单项（参照 legado：新建、本地导入、网络导入、二维码导入） */}
                <Show when={currentPage() === "sources"}>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMoreMenuOpen(false);
                      blurActiveElement();
                      props.onSourcesNew?.();
                    }}
                  >
                    <FileTextIcon class="h-4 w-4" />
                    <span>新建书源</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMoreMenuOpen(false);
                      blurActiveElement();
                      props.onSourcesImportLocal?.();
                    }}
                  >
                    <FolderPlusIcon class="h-4 w-4" />
                    <span>本地导入</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMoreMenuOpen(false);
                      blurActiveElement();
                      props.onSourcesImportNetwork?.();
                    }}
                  >
                    <LinkIcon class="h-4 w-4" />
                    <span>网络导入</span>
                  </DropdownMenuItem>
                  <Show when={props.showSourcesImportQR}>
                    <DropdownMenuItem
                      onSelect={() => {
                        setMoreMenuOpen(false);
                        blurActiveElement();
                        props.onSourcesImportQR?.();
                      }}
                    >
                      <QrCodeIcon class="h-4 w-4" />
                      <span>二维码导入</span>
                    </DropdownMenuItem>
                  </Show>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMoreMenuOpen(false);
                      blurActiveElement();
                      props.onOpenSourceGroupManage?.();
                    }}
                  >
                    <FolderTreeIcon class="h-4 w-4" />
                    <span>分组管理</span>
                  </DropdownMenuItem>
                  <Show when={isSourceFilterOrAll(props.currentSourceGroup ?? null)}>
                    <DropdownMenuItem
                      onSelect={() => props.onSourcesGroupByGroupNameChange?.(!props.sourcesGroupByGroupName)}
                      class="flex items-center gap-2"
                    >
                      <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
                        <Checkbox checked={!!props.sourcesGroupByGroupName} aria-label="按分组名显示" />
                      </span>
                      <span>按分组名显示</span>
                    </DropdownMenuItem>
                  </Show>
                  {/* 模糊搜索 / 扩展搜索规则（单选框，互斥） */}
                  <DropdownMenuItem
                    onSelect={() => props.onSourceSearchModeChange?.(sourceSearchModeRef.current === 'fuzzy' ? 'name' : 'fuzzy')}
                    class="flex items-center gap-2"
                  >
                    <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none" aria-label={props.sourceSearchMode === 'fuzzy' ? '已选' : '未选'}>
                      <span
                        class={cn(
                          'rounded-full border-2 border-primary',
                          props.sourceSearchMode === 'fuzzy' ? 'size-2.5 bg-primary' : 'size-4'
                        )}
                        aria-hidden
                      />
                    </span>
                    <span>模糊搜索</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => props.onSourceSearchModeChange?.(sourceSearchModeRef.current === 'extended' ? 'name' : 'extended')}
                    class="flex items-center gap-2"
                  >
                    <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none" aria-label={props.sourceSearchMode === 'extended' ? '已选' : '未选'}>
                      <span
                        class={cn(
                          'rounded-full border-2 border-primary',
                          props.sourceSearchMode === 'extended' ? 'size-2.5 bg-primary' : 'size-4'
                        )}
                        aria-hidden
                      />
                    </span>
                    <span>扩展搜索规则</span>
                  </DropdownMenuItem>
                </Show>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>

          {/* 帮助按钮 - 仅在设置页面显示 */}
          <Show when={currentPage() === "settings"}>
            <Tooltip>
              <TooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9">
                <span class="text-base">❓</span>
                <span class="sr-only">帮助</span>
              </TooltipTrigger>
              <TooltipContent>帮助</TooltipContent>
            </Tooltip>
          </Show>

          {/* 主题切换与窗口控制：竖向分隔，仅桌面端显示 */}
          <Show when={isTauri() && !isMobile()}>
            <Separator orientation="vertical" class="mx-2 h-6" />
          </Show>
          <div class="flex items-center gap-2">
            <ThemeSwitch withTooltip />
            <WindowControlButtons />
          </div>

        </div>
      </div>

      {/* 书架布局设置对话框 */}
      <Show when={currentPage() === "bookshelf"}>
        <BookshelfLayoutDialog
          open={showBookshelfLayoutDialog()}
          onOpenChange={(open) => {
            setShowBookshelfLayoutDialog(open);
            if (open) {
              // 对话框打开时，触发事件通知其他组件关闭菜单
              window.dispatchEvent(new CustomEvent('dialog-opened'));
            }
          }}
        />
      </Show>
    </header>
  );
}

import { For, Show, type Accessor } from "solid-js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { PageType } from "@/components/shell/Navigation";
import { BookshelfPendingUpdateNavBadge } from '@/components/media/reader/bookshelf/BookshelfPendingUpdateBadge';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/shared/icons";
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { componentDataAttr } from '@/lib/theme/preview/component-registry';
import type { RecentReadBook } from '@/lib/bookshelf/recent-reading';
import { SHELL_PAGE_CONFIG } from '@/lib/shell/shell-page-config';
import { normalizePageType } from '@/lib/media-shelf/compat-keys';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { ModuleNavSection } from '@/components/shell/ModuleNavSection';
import { useShellSidebarControls } from '@/components/shell/shell-sidebar-controls';
import { ShellSidebarSheet } from '@/components/shell/ShellSidebarSheet';
import { sidebarNavButtonClass, sidebarNavMenuClass, sidebarNavMenuItemClass } from '@/lib/shell/sidebar-nav-button-class';
import { sidebarIconRailScroll, scrollGutterAuto } from '@/lib/ui/viewport-classes';

const pageConfig = SHELL_PAGE_CONFIG;

interface SideBarProps {
  currentPage?: PageType;
  onPageChange?: (page: PageType) => void;
  recentBooks?: RecentReadBook[];
  onOpenRecentBook?: (book: RecentReadBook) => void;
  onOpenReaderRecord?: () => void;
  sidebarState: Accessor<"expanded" | "collapsed">;
  onToggleSidebar: () => void;
  offsetTopAppBar?: boolean;
  /** 由 App 壳层 host 托管宽度与定位（桌面固定侧栏） */
  shellHosted?: boolean;
}

export function SideBar(props: SideBarProps) {
  const shell = useShellLayout();
  const { usesShellSheet, closeShellSidebar, toggleShellSidebar } = useShellSidebarControls();
  const currentPage = () => normalizePageType(props.currentPage || "reader");
  const allPages: PageType[] = ['reader', 'music', 'tv', 'subscribe', 'settings'];
  const isPageActive = (page: PageType) => currentPage() === normalizePageType(page);
  const isCollapsed = () =>
    shell().sidebarUseSheet ? false : props.sidebarState() === "collapsed";
  const showModuleNav = () =>
    shell().showFusedModuleNav ||
    (shell().showModuleSidebarNav && shell().useMobileShell);

  function handlePageChange(page: PageType) {
    props.onPageChange?.(page);
  }

  const sidebarBody = (
    <div
      class={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden",
        shell().sidebarUseSheet && !props.offsetTopAppBar && "safe-area-inset-top",
      )}
    >
      <ThemedComponentBackground componentId="sidebar" />
      <div class="relative z-1 flex h-full min-h-0 flex-col">
        <SidebarContent
          class={cn(
            "relative z-1 flex min-h-0 flex-1 flex-col p-0",
            // 覆盖 ui/sidebar 默认 group-data-[collapsible=icon]:overflow-hidden，收起态仍可纵向滚动
            "group-data-[collapsible=icon]:overflow-x-hidden! group-data-[collapsible=icon]:overflow-y-auto!",
            isCollapsed() ? sidebarIconRailScroll : cn("overflow-y-auto overscroll-contain", scrollGutterAuto),
          )}
        >
        <div class="relative shrink-0 overflow-hidden" {...componentDataAttr('sidebarNav')}>
          <ThemedComponentBackground componentId="sidebarNav" />
          <div class="relative z-1">
        <SidebarGroup class={isCollapsed() ? "px-0" : undefined}>
          <SidebarGroupContent>
            <SidebarMenu class={sidebarNavMenuClass(isCollapsed())}>
              <For each={allPages}>
                {(page) => {
                  const config = pageConfig[page];
                  const active = () => isPageActive(page);
                  return (
                    <SidebarMenuItem class={sidebarNavMenuItemClass(isCollapsed())}>
                      <SidebarMenuButton
                        isActive={active()}
                        onClick={() => handlePageChange(page)}
                        tooltip={config.label}
                        class={sidebarNavButtonClass(active(), {
                          collapsed: isCollapsed(),
                          extra: 'group/menu-button',
                        })}
                      >
                        <span class={cn("relative shrink-0 transition-colors duration-200", isCollapsed() && "mx-auto")}>
                          <config.icon class="h-5 w-5" />
                          <Show when={page === 'reader' && isCollapsed()}>
                            <BookshelfPendingUpdateNavBadge
                              variant="sidebar-collapsed"
                              class="absolute -top-1 -right-1 z-10"
                            />
                          </Show>
                        </span>
                        <span class={cn("min-w-0 flex-1 truncate font-medium transition-colors duration-200", isCollapsed() && "hidden")}>
                          {config.label}
                        </span>
                        <Show when={page === 'reader' && !isCollapsed()}>
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

        <Show when={showModuleNav()}>
          <ModuleNavSection
            shellPage={currentPage()}
            collapsed={isCollapsed()}
            recentBooks={props.recentBooks}
            onOpenRecentBook={props.onOpenRecentBook}
            onOpenReaderRecord={props.onOpenReaderRecord}
            onNavigate={closeShellSidebar}
          />
        </Show>
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter
        class={cn(
          "relative mt-auto shrink-0 overflow-hidden border-t border-sidebar-border",
          isCollapsed() && "px-0",
        )}
        {...componentDataAttr('sidebarFooter')}
      >
        <ThemedComponentBackground componentId="sidebarFooter" />
        <div class="relative z-1">
        <SidebarMenu class={sidebarNavMenuClass(isCollapsed())}>
          <SidebarMenuItem class={sidebarNavMenuItemClass(isCollapsed())}>
            <SidebarMenuButton
              onClick={() => {
                if (shell().sidebarUseSheet) {
                  toggleShellSidebar();
                } else {
                  props.onToggleSidebar();
                }
              }}
              tooltip={isCollapsed() ? "展开侧边栏" : "收起侧边栏"}
              class={sidebarNavButtonClass(false, {
                collapsed: isCollapsed(),
                extra: 'group/toggle-button [&_svg]:size-4',
              })}
            >
              <Show
                when={isCollapsed()}
                fallback={
                  <>
                    <ChevronLeftIcon class="h-4 w-4 transition-colors duration-200" size={16} />
                    <span class={cn("font-medium transition-colors duration-200", isCollapsed() && "hidden")}>
                      收起
                    </span>
                  </>
                }
              >
                <ChevronRightIcon
                  class={cn("h-4 w-4 transition-colors duration-200", isCollapsed() && "mx-auto")}
                  size={16}
                />
              </Show>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        </div>
      </SidebarFooter>
      </div>
      </div>
  );

  const fixedSidebarClass = cn(
    "bottom-0! h-auto! overflow-hidden border-r border-sidebar-border",
    props.offsetTopAppBar
      ? "top-[calc(var(--app-bar-height)+var(--safe-area-top-effective))]!"
      : "top-0!",
  );
  /** Sheet 侧栏勿用 fixed 定位类，避免覆盖 ui/sheet 的 h-full */
  const sheetSidebarClass = "overflow-hidden border-r border-sidebar-border";
  const sidebarPresentationClass = () =>
    shell().sidebarUseSheet ? sheetSidebarClass : fixedSidebarClass;

  if (props.shellHosted) {
    return (
      <Sidebar collapsible="none" class="h-full w-full! min-h-0 overflow-hidden" {...componentDataAttr('sidebar')}>
        {sidebarBody}
      </Sidebar>
    );
  }

  return (
    <Show
      when={usesShellSheet()}
      fallback={
        <Sidebar
          collapsible="icon"
          class={sidebarPresentationClass()}
          {...componentDataAttr('sidebar')}
        >
          {sidebarBody}
        </Sidebar>
      }
    >
      <ShellSidebarSheet class={sheetSidebarClass} offsetTopAppBar={props.offsetTopAppBar}>
        {sidebarBody}
      </ShellSidebarSheet>
    </Show>
  );
}

import { For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import logoLight from "@/assets/icon-l-512x512.png";
import logoDark from "@/assets/icon-d-512x512.png";
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  APP_DROPDOWN_MENU_TITLE_LIST_CLASS,
} from "@/components/shared/AppDropdownMenu";
import { ThemeSwitch } from "@/components/shell/ThemeSwitch";
import { WindowControlButtons } from "@/components/shell/WindowControlButtons";
import { ShellSidebarTrigger } from '@/components/shell/ShellSidebarTrigger';
import { ChevronDownIcon } from "@/components/shared/icons";
import { getEffectiveDark } from "@/lib/theme";
import { settingsStore } from "@/stores/settings";
import { cn } from "@/lib/utils";
import { isMobile } from "@/lib/platform/detect";
import { BookshelfPendingUpdateNavBadge } from "@/components/media/reader/bookshelf/BookshelfPendingUpdateBadge";
import { useShellLayout } from "@/components/shell/ShellLayoutProvider";
import { normalizePageType } from '@/lib/media-shelf/compat-keys';
import { APP_DISPLAY_NAME } from "@/lib/shell/shell-page-config";
import {
  getModuleNavItems,
  getActiveModuleNavIdForShell,
  getModuleNavItemLabel,
  navigateModuleNav,
} from '@/lib/modules/module-nav-registry';

export type PageType =
  | "reader"
  | "music"
  | "tv"
  | "subscribe"
  | "download"
  | "media"
  | "media-cache"
  | "media-search"
  /** @deprecated 使用 reader */
  | "bookshelf"
  /** @deprecated 使用 reader */
  | "scout"
  /** @deprecated 使用 reader 内部书源 Tab */
  | "sources"
  /** @deprecated 使用 subscribe 或 reader 内部 RSS */
  | "rss"
  /** @deprecated 使用 reader 内部书签 Tab */
  | "bookmark"
  /** @deprecated 使用 reader 内部记录 Tab */
  | "record"
  /** @deprecated 使用 media-cache */
  | "bookshelf-cache"
  /** @deprecated 使用 media-search */
  | "book-search"
  | "explore"
  | "settings"
  | "remote-book"
  | "text-viewer"
  | "image-viewer"
  | "audio-viewer"
  | "video-viewer"
  | "file-viewer"
  | "pdf-viewer"
  | "book-info";

interface NavigationProps {
  currentPage?: PageType;
}

export function Navigation(props: NavigationProps) {
  const shell = useShellLayout();
  const isDark = () => getEffectiveDark(settingsStore.state.app.theme);
  const shellTab = () => normalizePageType(props.currentPage || "reader");
  const moduleNavId = () => getActiveModuleNavIdForShell(shellTab());
  const moduleNavItems = () => getModuleNavItems(shellTab());
  const showNavPendingBadge = () => !shell().showSidebar;
  const showSidebarTrigger = () =>
    shell().showTopNavigation && shell().sidebarUseSheet;
  const showDesktopChromeControls = () => !isMobile();

  function handleModuleNavChange(navId: string) {
    navigateModuleNav(shellTab(), navId);
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
          <Show when={showSidebarTrigger()}>
            <ShellSidebarTrigger class="shrink-0" />
          </Show>
          <div class="flex shrink-0 items-center gap-2">
            {/* logo 为纯白（浅色模式）/纯黑（深色模式）图标，容器使用实心 foreground 底色保证对比度 */}
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground shadow-sm transition-colors">
              <img
                src={isDark() ? logoDark : logoLight}
                alt={APP_DISPLAY_NAME}
                class="h-5 w-5 transition-opacity duration-300"
              />
            </div>
            <span class="hidden text-sm font-semibold text-foreground sm:inline">{APP_DISPLAY_NAME}</span>
          </div>

          <Show when={moduleNavItems().length > 0}>
            <div class="min-w-0 flex-1">
              <AppDropdownMenu>
                <AppDropdownMenuTrigger
                  class={cn(
                    "group/trigger inline-flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-md px-3 text-sm font-medium",
                    "bg-transparent hover:bg-accent hover:text-accent-foreground",
                    "data-expanded:bg-accent/50",
                  )}
                >
                  <span class="min-w-0 truncate">{getModuleNavItemLabel(shellTab(), moduleNavId())}</span>
                  <Show when={showNavPendingBadge() && shellTab() === "reader" && moduleNavId() === 'shelf'}>
                    <BookshelfPendingUpdateNavBadge class="shrink-0" />
                  </Show>
                  <ChevronDownIcon
                    class="size-3 shrink-0 transition-transform duration-200 group-data-expanded/trigger:rotate-180"
                    size={12}
                  />
                </AppDropdownMenuTrigger>
                <AppDropdownMenuContent layout="titleWide">
                  <div class={cn(APP_DROPDOWN_MENU_TITLE_LIST_CLASS, "py-1")}>
                    <For each={moduleNavItems()}>
                      {(item) => (
                        <AppDropdownMenuItem
                          class={cn(
                            "flex min-h-12 w-full min-w-0 items-center gap-3 rounded-md p-2.5",
                            moduleNavId() === item.id && "bg-accent/50",
                          )}
                          onSelect={() => handleModuleNavChange(item.id)}
                        >
                          <Show when={item.icon}>
                            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/50">
                              <Dynamic component={item.icon!} class="h-4 w-4" />
                            </div>
                          </Show>
                          <div class="min-w-0 flex-1 space-y-0.5 py-0.5">
                            <span class="block min-w-0 truncate text-sm font-medium">{item.label}</span>
                            <Show when={item.description}>
                              <span class="block truncate text-xs leading-snug text-muted-foreground">
                                {item.description}
                              </span>
                            </Show>
                          </div>
                        </AppDropdownMenuItem>
                      )}
                    </For>
                  </div>
                </AppDropdownMenuContent>
              </AppDropdownMenu>
            </div>
          </Show>
        </div>

        <Show when={showDesktopChromeControls()}>
          <div class="flex shrink-0 items-center gap-2">
            <ThemeSwitch withTooltip />
            <WindowControlButtons />
          </div>
        </Show>
      </div>
    </header>
  );
}

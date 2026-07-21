import { For, Show } from "solid-js";
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
import { ShellSidebarTrigger } from '@/components/shell/ShellSidebarTrigger';
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
    shell().showTopNavigation &&
    (shell().sidebarUseSheet ||
      (shell().showModuleSidebarNav && !shell().showSidebar));
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
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shadow-sm transition-colors dark:bg-primary/20">
              <img
                src={isDark() ? logoDark : logoLight}
                alt={APP_DISPLAY_NAME}
                class="h-6 w-6 transition-opacity duration-300"
              />
            </div>
            <span class="hidden text-sm font-semibold text-foreground sm:inline">{APP_DISPLAY_NAME}</span>
          </div>

          <Show when={moduleNavItems().length > 0}>
            <NavigationMenu class="min-w-0 flex-1">
              <NavigationMenuItem>
                <NavigationMenuTrigger class="h-9 max-w-full gap-1.5 px-3 text-sm font-medium">
                  <span class="min-w-0 truncate">{getModuleNavItemLabel(shellTab(), moduleNavId())}</span>
                  <Show when={showNavPendingBadge() && shellTab() === "reader" && moduleNavId() === 'shelf'}>
                    <BookshelfPendingUpdateNavBadge class="shrink-0" />
                  </Show>
                  <NavigationMenuIcon />
                </NavigationMenuTrigger>
                <NavigationMenuContent class="p-0">
                  <div class="grid max-h-[80dvh] w-[min(100dvw-2rem,240px)] min-w-0 gap-2 overflow-y-auto scroll-gutter-stable-both px-2 py-2 mb-2 md:w-[320px]">
                    <For each={moduleNavItems()}>
                      {(item) => (
                        <NavigationMenuLink
                          as="button"
                          onClick={() => handleModuleNavChange(item.id)}
                          class={cn(
                            "flex w-full min-h-12 min-w-0 select-none items-center gap-3 rounded-md p-2.5 text-left leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                            moduleNavId() === item.id && "bg-accent/50"
                          )}
                        >
                          <Show when={item.icon}>
                            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/50">
                              <Dynamic component={item.icon!} class="h-4 w-4" />
                            </div>
                          </Show>
                          <div class="min-w-0 flex-1 space-y-0.5 py-0.5">
                            <NavigationMenuLabel class="block min-w-0 truncate text-sm font-medium">
                              {item.label}
                            </NavigationMenuLabel>
                            <Show when={item.description}>
                              <NavigationMenuDescription class="block truncate text-xs leading-snug text-muted-foreground">
                                {item.description}
                              </NavigationMenuDescription>
                            </Show>
                          </div>
                        </NavigationMenuLink>
                      )}
                    </For>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenu>
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

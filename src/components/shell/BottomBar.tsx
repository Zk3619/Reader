import { For, Show, createMemo } from "solid-js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { appBottomChromePadding } from "@/lib/ui/viewport-classes";
import type { PageType } from "@/components/shell/Navigation";
import { BookshelfPendingUpdateNavBadge } from "@/components/bookshelf/BookshelfPendingUpdateBadge";
import { SHELL_PAGE_CONFIG } from "@/lib/shell/shell-page-config";
import { normalizePageType } from '@/lib/media-shelf/compat-keys';

const pageConfig = SHELL_PAGE_CONFIG;

interface BottomBarProps {
  currentPage?: PageType;
  onPageChange?: (page: PageType) => void;
}

export function BottomBar(props: BottomBarProps) {
  // 处理页面切换
  function handlePageChange(page: PageType) {
    props.onPageChange?.(page);
  }

  // 底栏显示的页面（书架、书源、订阅、其他）
  const bottomBarPages: PageType[] = ["reader", "music", "tv", "subscribe", "settings"];

  return (
    <div class={cn(
      "fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/95",
      appBottomChromePadding,
    )}>
      <div class="flex h-14 items-center justify-around px-2">
        <For each={bottomBarPages}>
          {(page) => {
            const config = pageConfig[page];
            const currentPage = () => normalizePageType(props.currentPage || "reader");
            const buttonClass = createMemo(() => cn(
              "flex-1 flex-col items-center justify-center gap-1 h-10 rounded-md transition-colors",
              currentPage() !== normalizePageType(page) && "hover:bg-accent hover:text-accent-foreground",
              currentPage() === normalizePageType(page) && "bg-accent text-accent-foreground"
            ));
            return (
              <Button
                variant="ghost"
                onClick={() => handlePageChange(page)}
                class={buttonClass()}
              >
                <span class="relative inline-flex">
                  {(() => {
                    const Icon = config.icon;
                    return <Icon class="h-5 w-5" />;
                  })()}
                  <Show when={page === 'reader'}>
                    <BookshelfPendingUpdateNavBadge class="absolute -top-1.5 -right-2.5 z-10" />
                  </Show>
                </span>
                <span class="text-xs font-medium">{config.label}</span>
              </Button>
            );
          }}
        </For>
      </div>
    </div>
  );
}

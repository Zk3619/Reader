import { For, Show, createMemo, type Component } from "solid-js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PageType } from "@/components/shell/Navigation";
import { BookshelfPendingUpdateNavBadge } from "@/components/bookshelf/BookshelfPendingUpdateBadge";
import {
  BookshelfIcon,
  BookSourceIcon,
  SubscriptionIcon,
  BookmarkIcon,
  BookInfoIcon,
  RecordIcon,
  SettingsIcon,
  GlobeIcon,
  BookOpenIcon,
} from "@/components/shared/icons";

// 页面配置（与 Navigation 和 SideBar 组件保持一致）
const pageConfig: Record<PageType, { label: string; icon: Component<any> }> = {
  bookshelf: { label: "书架", icon: BookshelfIcon },
  scout: { label: "探索", icon: BookOpenIcon },
  sources: { label: "书源", icon: BookSourceIcon },
  explore: { label: "发现", icon: BookSourceIcon },
  subscription: { label: "订阅", icon: SubscriptionIcon },
  bookmark: { label: "书签", icon: BookmarkIcon },
  record: { label: "记录", icon: RecordIcon },
  settings: { label: "设置", icon: SettingsIcon },
  "remote-book": { label: "远程书籍", icon: GlobeIcon },
  reader: { label: "阅读器", icon: BookmarkIcon }, // reader 页面通常不显示在导航中，但需要配置以避免类型错误
  "book-info": { label: "书籍信息", icon: BookInfoIcon }, // book-info 页面通常不显示在导航中，但需要配置以避免类型错误
  "book-search": { label: "搜索", icon: BookOpenIcon },
  "bookshelf-cache": { label: "缓存章节", icon: BookshelfIcon },
};

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
  const bottomBarPages: PageType[] = ["bookshelf", "scout", "sources", "subscription", "settings"];

  return (
    <div class="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/95 safe-area-inset-bottom">
      <div class="flex h-14 items-center justify-around px-2">
        <For each={bottomBarPages}>
          {(page) => {
            const config = pageConfig[page];
            const currentPage = () => props.currentPage || "bookshelf";
            const buttonClass = createMemo(() => cn(
              "flex-1 flex-col items-center justify-center gap-1 h-10 rounded-md transition-colors",
              currentPage() !== page && "hover:bg-accent hover:text-accent-foreground",
              currentPage() === page && "bg-accent text-accent-foreground"
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
                  <Show when={page === 'bookshelf'}>
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

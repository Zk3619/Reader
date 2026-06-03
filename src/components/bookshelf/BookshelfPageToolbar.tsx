/**
 * 书架页操作区：搜索（本地过滤 + 回车全网搜索）、更多菜单
 */

import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
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
  ExportIcon,
  ImportIcon,
  FileTextIcon,
} from '@/components/shared/icons';
import { BookshelfLayoutDialog } from '@/components/bookshelf/BookshelfLayoutDialog';
import { BookshelfPendingUpdateNavBadge } from '@/components/bookshelf/BookshelfPendingUpdateBadge';
import type { PageType } from '@/components/shell/Navigation';
import type { SearchMode } from '@/lib/search/search-prefs';
import { cn } from '@/lib/utils';

export interface BookshelfPageToolbarProps {
  onPageChange?: (page: PageType) => void;
  onOpenGroupManage?: () => void;
  onOpenBookshelfManage?: () => void;
  onImportLocal?: () => void;
  onAddBookByUrl?: () => void;
  onUpdateToc?: () => void;
  onOpenChapterCache?: () => void;
  onExportBookshelf?: () => void;
  onImportBookshelf?: () => void;
  showReloadLocal?: boolean;
  isReloadingLocal?: boolean;
  onReloadLocal?: () => void;
  pendingUpdateScope?: 'total' | 'group';
  pendingUpdateBookUrls?: () => readonly string[];
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  /** books：书籍本地过滤 + 全网搜索；groups：仅分组名常规过滤（与分组管理页一致） */
  searchTarget?: 'books' | 'groups';
  searchMode?: SearchMode;
  onSearchModeChange?: (mode: SearchMode) => void;
  /** 回车或点击「搜索」进入全网搜索页（仅 books） */
  onOpenGlobalSearch?: (query: string) => void;
}

function MenuRadioIndicator(props: { selected: boolean }) {
  return (
    <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
      <span class="relative flex size-4 items-center justify-center" aria-hidden>
        <span class="size-4 rounded-full border border-primary" />
        <Show when={props.selected}>
          <span class="absolute size-2 rounded-full bg-primary" />
        </Show>
      </span>
    </span>
  );
}

export function BookshelfPageToolbar(props: BookshelfPageToolbarProps) {
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);
  const [showBookshelfLayoutDialog, setShowBookshelfLayoutDialog] = createSignal(false);

  onMount(() => {
    const handleDialogOpened = () => {
      setMoreMenuOpen(false);
      blurActiveElement();
    };
    window.addEventListener('dialog-opened', handleDialogOpened);
    onCleanup(() => {
      window.removeEventListener('dialog-opened', handleDialogOpened);
    });
  });

  const isGroupSearch = () => (props.searchTarget ?? 'books') === 'groups';
  const openGlobalSearchPage = () => {
    props.onOpenGlobalSearch?.((props.searchQuery ?? '').trim());
  };

  return (
    <>
      <div class="flex shrink-0 items-center gap-2">
        <BookshelfPendingUpdateNavBadge
          class="self-center"
          scope={props.pendingUpdateScope}
          scopeBookUrls={props.pendingUpdateBookUrls}
        />
        <Tooltip>
          <TooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="h-9 w-9 shrink-0"
            onClick={openGlobalSearchPage}
          >
            <SearchIcon class="h-4 w-4" />
            <span class="sr-only">搜索</span>
          </TooltipTrigger>
          <TooltipContent>{isGroupSearch() ? '进入搜索页' : '进入搜索页'}</TooltipContent>
        </Tooltip>

        <Show when={props.showReloadLocal}>
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              disabled={props.isReloadingLocal}
              onClick={() => props.onReloadLocal?.()}
              aria-label="重新加载书籍列表"
            >
              <RefreshIcon
                class={cn('h-4 w-4', props.isReloadingLocal && 'animate-spin')}
              />
              <span class="sr-only">重新加载书籍列表</span>
            </TooltipTrigger>
            <TooltipContent>
              {props.isReloadingLocal ? '重新加载中…' : '重新加载书籍列表'}
            </TooltipContent>
          </Tooltip>
        </Show>

        <AppDropdownMenu open={moreMenuOpen()} onOpenChange={setMoreMenuOpen}>
          <Tooltip>
            <TooltipTrigger as="div">
              <AppDropdownMenuTrigger
                as={(triggerProps: Record<string, unknown>) => (
                  <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                    <MoreIcon class="h-4 w-4" />
                    <span class="sr-only">更多</span>
                  </AppDropdownMenuIconTrigger>
                )}
              />
            </TooltipTrigger>
            <TooltipContent>更多</TooltipContent>
          </Tooltip>
          <AppDropdownMenuContent layout="compact">
            <AppDropdownMenuItem onSelect={() => props.onUpdateToc?.()}>
              <RefreshIcon class="h-4 w-4" />
              <span>更新目录</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => props.onImportLocal?.()}>
              <FolderPlusIcon class="h-4 w-4" />
              <span>添加本地</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => props.onPageChange?.('remote-book')}>
              <GlobeIcon class="h-4 w-4" />
              <span>远程书籍</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => props.onAddBookByUrl?.()}>
              <LinkIcon class="h-4 w-4" />
              <span>添加网址</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuSeparator />
            <AppDropdownMenuItem onSelect={() => props.onOpenBookshelfManage?.()}>
              <Settings2Icon class="h-4 w-4" />
              <span>书架管理</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => setShowBookshelfLayoutDialog(true)}>
              <LayoutIcon class="h-4 w-4" />
              <span>书架布局</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => props.onOpenGroupManage?.()}>
              <FolderTreeIcon class="h-4 w-4" />
              <span>分组管理</span>
            </AppDropdownMenuItem>
            <Show when={!isGroupSearch()}>
              <AppDropdownMenuSeparator />
              <AppDropdownMenuItem onSelect={() => props.onSearchModeChange?.('name')}>
                <MenuRadioIndicator selected={(props.searchMode ?? 'name') === 'name'} />
                <span>常规搜索</span>
              </AppDropdownMenuItem>
              <AppDropdownMenuItem onSelect={() => props.onSearchModeChange?.('fuzzy')}>
                <MenuRadioIndicator selected={props.searchMode === 'fuzzy'} />
                <span>模糊搜索</span>
              </AppDropdownMenuItem>
              <AppDropdownMenuItem onSelect={() => props.onSearchModeChange?.('extended')}>
                <MenuRadioIndicator selected={props.searchMode === 'extended'} />
                <span>扩展搜索</span>
              </AppDropdownMenuItem>
              <AppDropdownMenuSeparator />
            </Show>
            <AppDropdownMenuItem onSelect={() => props.onOpenChapterCache?.()}>
              <DownloadIcon class="h-4 w-4" />
              <span>缓存导出</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => props.onExportBookshelf?.()}>
              <ExportIcon class="h-4 w-4" />
              <span>导出书单</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => props.onImportBookshelf?.()}>
              <ImportIcon class="h-4 w-4" />
              <span>导入书单</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuSeparator />
            <AppDropdownMenuItem>
              <FileTextIcon class="h-4 w-4" />
              <span>查看日志</span>
            </AppDropdownMenuItem>
          </AppDropdownMenuContent>
        </AppDropdownMenu>

        <BookshelfLayoutDialog
          open={showBookshelfLayoutDialog()}
          onOpenChange={setShowBookshelfLayoutDialog}
        />
      </div>
    </>
  );
}

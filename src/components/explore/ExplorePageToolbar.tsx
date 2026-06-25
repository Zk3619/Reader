/**
 * 探索页操作区：搜索、刷新列表/分类/整页、更多（布局偏好）
 */

import { Show, createSignal, onMount } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { ExploreLayoutDialog } from '@/components/explore/ExploreLayoutDialog';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  SearchIcon,
  MoreIcon,
  RefreshIcon,
  ListRefreshIcon,
  FolderRefreshIcon,
  Settings2Icon,
} from '@/components/shared/icons';

export interface ExplorePageToolbarProps {
  showRefresh?: boolean;
  refreshListDisabled?: boolean;
  onRefreshList?: () => void;
  refreshCategoriesDisabled?: boolean;
  onRefreshCategories?: () => void;
  refreshPageDisabled?: boolean;
  onRefreshPage?: () => void;
  searchDisabled?: boolean;
  onSearch?: () => void;
}

export function ExplorePageToolbar(props: ExplorePageToolbarProps) {
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);
  const [layoutDialogOpen, setLayoutDialogOpen] = createSignal(false);

  onMount(() => {
    const handleDialogOpened = () => {
      setMoreMenuOpen(false);
      blurActiveElement();
    };
    window.addEventListener('dialog-opened', handleDialogOpened);
    return () => window.removeEventListener('dialog-opened', handleDialogOpened);
  });

  return (
    <>
      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          disabled={props.searchDisabled}
          onClick={() => props.onSearch?.()}
        >
          <SearchIcon class="h-4 w-4" />
          <span class="sr-only">搜索</span>
        </AppTooltipTrigger>
        <AppTooltipContent>搜索</AppTooltipContent>
      </AppTooltip>

      <Show when={props.showRefresh}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="h-9 w-9"
            disabled={props.refreshListDisabled}
            onClick={() => props.onRefreshList?.()}
          >
            <ListRefreshIcon class="h-4 w-4" />
            <span class="sr-only">刷新列表</span>
          </AppTooltipTrigger>
          <AppTooltipContent>刷新列表</AppTooltipContent>
        </AppTooltip>

        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="h-9 w-9"
            disabled={props.refreshCategoriesDisabled}
            onClick={() => props.onRefreshCategories?.()}
          >
            <FolderRefreshIcon class="h-4 w-4" />
            <span class="sr-only">刷新分类</span>
          </AppTooltipTrigger>
          <AppTooltipContent>刷新分类</AppTooltipContent>
        </AppTooltip>

        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="h-9 w-9"
            disabled={props.refreshPageDisabled}
            onClick={() => props.onRefreshPage?.()}
          >
            <RefreshIcon class="h-4 w-4" />
            <span class="sr-only">刷新整页</span>
          </AppTooltipTrigger>
          <AppTooltipContent>刷新整页</AppTooltipContent>
        </AppTooltip>
      </Show>

      <AppDropdownMenu open={moreMenuOpen()} onOpenChange={setMoreMenuOpen}>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </AppDropdownMenuIconTrigger>
              )}
            />
          </AppTooltipTrigger>
          <AppTooltipContent>更多</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenuContent layout="compact">
          <AppDropdownMenuItem onSelect={() => setLayoutDialogOpen(true)}>
            <Settings2Icon class="h-4 w-4" />
            <span>布局偏好</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>

      <ExploreLayoutDialog open={layoutDialogOpen()} onOpenChange={setLayoutDialogOpen} />
    </>
  );
}

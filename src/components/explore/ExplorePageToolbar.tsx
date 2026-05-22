/**
 * 探索页操作区：搜索、收藏、更多（分页偏好、书源下拉/标签）
 */

import { Show, createSignal, onMount } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { SearchIcon, StarIcon, MoreIcon, RefreshIcon, Settings2Icon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { explorePageLayoutStore } from '@/stores/explore-page-layout';

export interface ExplorePageToolbarProps {
  showRefresh?: boolean;
  refreshDisabled?: boolean;
  onRefresh?: () => void;
  onPaginationPreference?: () => void;
}

export function ExplorePageToolbar(props: ExplorePageToolbarProps) {
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);
  const sourceDropdownEnabled = () => explorePageLayoutStore.settings.sourceDropdownEnabled;
  const sourceTabsEnabled = () => explorePageLayoutStore.settings.sourceTabsEnabled;
  /** 仅剩书源下拉时不可取消，保证至少勾选一项 */
  const dropdownToggleLocked = () => sourceDropdownEnabled() && !sourceTabsEnabled();
  const tabsToggleLocked = () => sourceTabsEnabled() && !sourceDropdownEnabled();

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
      <Tooltip>
        <TooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9 shrink-0">
          <SearchIcon class="h-4 w-4" />
          <span class="sr-only">搜索</span>
        </TooltipTrigger>
        <TooltipContent>搜索</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9">
          <StarIcon class="h-4 w-4" />
          <span class="sr-only">收藏</span>
        </TooltipTrigger>
        <TooltipContent>收藏</TooltipContent>
      </Tooltip>

      <Show when={props.showRefresh}>
        <Tooltip>
          <TooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="h-9 w-9"
            disabled={props.refreshDisabled}
            onClick={() => props.onRefresh?.()}
          >
            <RefreshIcon
              class={cn('h-4 w-4 transition-transform', props.refreshDisabled && 'animate-spin')}
            />
            <span class="sr-only">刷新</span>
          </TooltipTrigger>
          <TooltipContent>刷新列表</TooltipContent>
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
          <AppDropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onPaginationPreference?.();
            }}
          >
            <Settings2Icon class="h-4 w-4" />
            <span>分页偏好</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem
            onSelect={() => {
              if (dropdownToggleLocked()) return;
              explorePageLayoutStore.toggleSourceDropdown();
            }}
            class={cn('flex items-center gap-2', dropdownToggleLocked() && 'opacity-60')}
          >
            <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
              <Checkbox
                checked={sourceDropdownEnabled()}
                disabled={dropdownToggleLocked()}
                aria-label="书源下拉"
              />
            </span>
            <span>书源下拉</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              if (tabsToggleLocked()) return;
              explorePageLayoutStore.toggleSourceTabs();
            }}
            class={cn('flex items-center gap-2', tabsToggleLocked() && 'opacity-60')}
          >
            <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
              <Checkbox
                checked={sourceTabsEnabled()}
                disabled={tabsToggleLocked()}
                aria-label="书源标签"
              />
            </span>
            <span>书源标签</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}

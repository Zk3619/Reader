/**
 * 探索页操作区：搜索、更多（布局偏好）
 */

import { Show, createSignal, onMount } from 'solid-js';
import { blurActiveElement, openAppDialogAfterMenuDismiss } from '@/utils/accessibility';
import { ExploreLayoutDialog } from '@/components/explore/ExploreLayoutDialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { SearchIcon, MoreIcon, RefreshIcon, Settings2Icon } from '@/components/shared/icons';

export interface ExplorePageToolbarProps {
  showRefresh?: boolean;
  refreshDisabled?: boolean;
  onRefresh?: () => void;
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
      <Tooltip>
        <TooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          disabled={props.searchDisabled}
          onClick={() => props.onSearch?.()}
        >
          <SearchIcon class="h-4 w-4" />
          <span class="sr-only">搜索</span>
        </TooltipTrigger>
        <TooltipContent>搜索</TooltipContent>
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
            <RefreshIcon class="h-4 w-4" />
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
            onSelect={() => openAppDialogAfterMenuDismiss(() => setLayoutDialogOpen(true))}
          >
            <Settings2Icon class="h-4 w-4" />
            <span>布局偏好</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>

      <ExploreLayoutDialog open={layoutDialogOpen()} onOpenChange={setLayoutDialogOpen} />
    </>
  );
}

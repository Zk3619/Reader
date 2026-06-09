/**
 * 书签列表项「更多」菜单
 */

import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from '@/components/shared/AppDropdownMenu';
import { MoreIcon } from '@/components/shared/icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface BookmarkRowMenuProps {
  onEdit: () => void;
  onDelete: () => void;
}

export function BookmarkRowMenu(props: BookmarkRowMenuProps) {
  return (
    <div class="flex shrink-0 items-center">
      <AppDropdownMenu>
        <Tooltip>
          <TooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 data-expanded:opacity-100"
              aria-label="更多操作"
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <MoreIcon class="h-4 w-4" size={16} />
            </AppDropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>更多操作</TooltipContent>
        </Tooltip>
        <AppDropdownMenuContent align="end">
          <AppDropdownMenuItem onSelect={props.onEdit}>编辑</AppDropdownMenuItem>
          <AppDropdownMenuItem
            class="text-destructive focus:text-destructive"
            onSelect={props.onDelete}
          >
            删除
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </div>
  );
}

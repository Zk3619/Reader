/**
 * 分组管理页 PageToolbar 操作区
 */

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronLeftIcon } from '@/components/shared/icons';

export function BookGroupManageToolbarLeading(props: { onBack: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="h-9 w-9 shrink-0"
        onClick={props.onBack}
        aria-label="返回书架"
        type="button"
      >
        <ChevronLeftIcon class="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent>返回书架</TooltipContent>
    </Tooltip>
  );
}

export function BookGroupManagePageToolbar(props: { onAdd: () => void }) {
  return (
    <Button variant="default" type="button" onClick={props.onAdd}>
      添加分组
    </Button>
  );
}

/**
 * 设置页操作区：帮助按钮
 */

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function SettingsPageToolbar() {
  return (
    <Tooltip>
      <TooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9">
        <span class="text-base">❓</span>
        <span class="sr-only">帮助</span>
      </TooltipTrigger>
      <TooltipContent>帮助</TooltipContent>
    </Tooltip>
  );
}

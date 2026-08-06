/**
 * 设置页操作区：搜索与帮助
 */

import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { ExpandableIconSearch } from '@/components/shared/ExpandableIconSearch';
import { ChevronLeftIcon, BookInfoIcon } from '@/components/shared/icons';

export interface SettingsPageToolbarProps {
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}

export function SettingsToolbarLeading(props: {
  onBack: () => void;
  /** 无障碍与 tooltip；默认「返回」 */
  label?: string;
}) {
  const label = () => props.label ?? '返回';
  return (
    <AppTooltip>
      <AppTooltipTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="h-9 w-9 shrink-0 text-foreground"
        onClick={props.onBack}
        aria-label={label()}
        type="button"
      >
        <ChevronLeftIcon class="h-4 w-4" />
      </AppTooltipTrigger>
      <AppTooltipContent>{label()}</AppTooltipContent>
    </AppTooltip>
  );
}

export function SettingsPageToolbar(props: SettingsPageToolbarProps) {
  return (
    <div class="flex items-center gap-1">
      <ExpandableIconSearch
        value={props.searchQuery ?? ''}
        onValueChange={(v) => props.onSearchQueryChange?.(v)}
        placeholder="搜索设置项…"
        tooltip="搜索设置"
        aria-label="搜索设置"
      />
      <AppTooltip>
        <AppTooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9">
          <BookInfoIcon class="h-4 w-4" />
          <span class="sr-only">帮助</span>
        </AppTooltipTrigger>
        <AppTooltipContent>帮助</AppTooltipContent>
      </AppTooltip>
    </div>
  );
}

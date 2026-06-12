import type { DictRule } from '@/types';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch, SwitchControl, SwitchThumb } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { TruncatedTooltip } from '@/components/shared/TruncatedTooltip';
import { PencilIcon, MoreIcon } from '@/components/shared/icons';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppDropdownMenuIconTrigger,
} from '@/components/shared/AppDropdownMenu';
import { RULE_MANAGE_ROW_HEIGHT_PX } from '@/components/replace-rules/VirtualRuleManageList';

export interface DictRuleListItemProps {
  rule: DictRule;
  selected: boolean;
  onToggleSelection: () => void;
  onSelectionChange: (checked: boolean) => void;
  onEnableChange: (enabled: boolean) => void;
  onEdit: () => void;
  onMoveTop: () => void;
  onMoveBottom: () => void;
  onDelete: () => void;
}

export function DictRuleListItem(props: DictRuleListItemProps) {
  const subtitle = () => props.rule.urlRule.trim() || '（空 URL 规则）';

  return (
    <div
      class={cn(
        'border-b border-border/40',
        'flex cursor-pointer items-center gap-2 px-2 sm:gap-3 sm:px-3',
        'hover:bg-accent/30',
        props.selected && 'bg-accent/20',
      )}
      style={{ height: `${RULE_MANAGE_ROW_HEIGHT_PX}px` }}
      onClick={props.onToggleSelection}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            props.onToggleSelection();
          }
        }}
      >
        <div class="shrink-0" onClick={(e) => e.stopPropagation()} role="presentation">
          <Checkbox
            checked={props.selected}
            onChange={props.onSelectionChange}
            aria-label={`选择 ${props.rule.name}`}
          />
        </div>

        <div class="min-w-0 flex-1 overflow-hidden">
          <TruncatedTooltip
            as="div"
            text={props.rule.name}
            class="truncate font-medium text-foreground"
          />
          <TruncatedTooltip
            as="div"
            text={subtitle()}
            class="mt-0.5 truncate font-mono text-xs text-muted-foreground"
          />
        </div>

        <div
          class="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          role="presentation"
        >
          <Switch
            checked={props.rule.enabled}
            onChange={(checked) => props.onEnableChange(!!checked)}
            aria-label={props.rule.enabled ? '禁用规则' : '启用规则'}
          >
            <SwitchControl class="data-disabled:cursor-not-allowed">
              <SwitchThumb />
            </SwitchControl>
          </Switch>

          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 shrink-0"
            aria-label="编辑"
            onClick={props.onEdit}
          >
            <PencilIcon class="h-4 w-4" />
          </Button>

          <AppDropdownMenu>
            <AppDropdownMenuTrigger
              as={(p: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger
                  triggerProps={p}
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 shrink-0"
                  aria-label="更多操作"
                >
                  <MoreIcon class="h-4 w-4" />
                </AppDropdownMenuIconTrigger>
              )}
            />
            <AppDropdownMenuContent layout="compact">
              <AppDropdownMenuItem onSelect={props.onMoveTop}>置顶</AppDropdownMenuItem>
              <AppDropdownMenuItem onSelect={props.onMoveBottom}>置底</AppDropdownMenuItem>
              <AppDropdownMenuItem
                class="text-destructive focus:text-destructive"
                onSelect={props.onDelete}
              >
                删除
              </AppDropdownMenuItem>
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        </div>
    </div>
  );
}

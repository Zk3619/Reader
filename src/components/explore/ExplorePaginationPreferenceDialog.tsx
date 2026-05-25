/**
 * 探索页分页偏好对话框（与 BookshelfLayoutDialog 相同：AppDialog + 本地 open 状态由调用方持有）
 */

import { onMount } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import {
  explorePaginationPreference,
  initExplorePaginationPreference,
  setExplorePaginationPreference,
  type PaginationPreference,
} from '@/stores/explore-pagination-preference';

export interface ExplorePaginationPreferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExplorePaginationPreferenceDialog(props: ExplorePaginationPreferenceDialogProps) {
  onMount(() => void initExplorePaginationPreference());

  const save = (value: string) => {
    void setExplorePaginationPreference(value as PaginationPreference);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>分页偏好</AppDialogTitle>
          <AppDialogDescription>选择发现页的加载方式</AppDialogDescription>
        </AppDialogHeader>
        <div class="min-h-0 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <RadioGroup
            value={explorePaginationPreference()}
            onChange={save}
            class="space-y-1"
          >
            <RadioGroupItem value="scroll" class="items-start py-2">
              <RadioGroupItemLabel class="flex-1 cursor-pointer">
                <div class="font-medium">滚动加载</div>
                <div class="text-xs text-muted-foreground">滚动到底部时自动加载更多</div>
              </RadioGroupItemLabel>
            </RadioGroupItem>
            <RadioGroupItem value="pagination" class="items-start py-2">
              <RadioGroupItemLabel class="flex-1 cursor-pointer">
                <div class="font-medium">分页列表</div>
                <div class="text-xs text-muted-foreground">点击「加载更多」按钮手动加载</div>
              </RadioGroupItemLabel>
            </RadioGroupItem>
          </RadioGroup>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}

/**
 * 选择书籍分组（移入 / 加入均为多选）
 */

import { For, Show, createSignal, createEffect } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { FolderPlusIcon } from '@/components/shared/icons';
import type { BookGroup } from '@/types';

export type BookGroupPickMode = 'add' | 'move';

export interface BookGroupPickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: BookGroupPickMode;
  title: string;
  description?: string;
  groups: BookGroup[];
  /** 打开对话框时的默认选中分组 id */
  initialGroupIds?: number[];
  onConfirm: (groupIds: number[]) => void;
  onAddGroup?: () => void;
}

const listItemClass =
  'flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent/40';

function GroupPickBulkActions(props: {
  selectedCount: () => number;
  totalCount: () => number;
  onSelectAll: () => void;
  onClear: () => void;
  onInvert: () => void;
}) {
  const allSelected = () =>
    props.totalCount() > 0 && props.selectedCount() === props.totalCount();

  return (
    <div class="flex flex-wrap items-start justify-end gap-1 px-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 px-2 text-xs"
        disabled={props.totalCount() === 0}
        onClick={() => {
          if (allSelected()) props.onClear();
          else props.onSelectAll();
        }}
      >
        {allSelected() ? '取消全选' : '全选'}({props.selectedCount()}/{props.totalCount()})
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 px-2 text-xs"
        disabled={props.selectedCount() === 0}
        onClick={props.onClear}
      >
        取消选中
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 px-2 text-xs"
        disabled={props.totalCount() === 0}
        onClick={props.onInvert}
      >
        反选
      </Button>
    </div>
  );
}

export function BookGroupPickDialog(props: BookGroupPickDialogProps) {
  const [selectedIds, setSelectedIds] = createSignal<number[]>([]);

  const pickableGroups = () => props.groups.filter((g) => g.groupId > 0);
  const allGroupIds = () => pickableGroups().map((g) => g.groupId);

  createEffect(() => {
    if (!props.open) return;
    setSelectedIds([...(props.initialGroupIds ?? [])]);
  });

  function toggleGroupId(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleConfirm() {
    const ids = selectedIds();
    if (ids.length === 0) return;
    props.onConfirm(ids);
    props.onOpenChange(false);
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader
          actions={
            <Show when={props.onAddGroup}>
              <AppTooltip>
                <AppTooltipTrigger
                  onFocus={(e) => e.preventDefault()}
                  as={(triggerProps: Record<string, unknown>) => (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      class="h-9 w-9 shrink-0"
                      onClick={() => props.onAddGroup?.()}
                      {...triggerProps}
                    >
                      <FolderPlusIcon class="h-4 w-4" size={16} />
                      <span class="sr-only">添加分组</span>
                    </Button>
                  )}
                />
                <AppTooltipContent class="z-100">添加分组</AppTooltipContent>
              </AppTooltip>
            </Show>
          }
        >
          <AppDialogTitle>{props.title}</AppDialogTitle>
          <Show when={props.description}>
            <AppDialogDescription>{props.description}</AppDialogDescription>
          </Show>
        </AppDialogHeader>

        <GroupPickBulkActions
          selectedCount={() => selectedIds().length}
          totalCount={() => pickableGroups().length}
          onSelectAll={() => setSelectedIds(allGroupIds())}
          onClear={() => setSelectedIds([])}
          onInvert={() => {
            const cur = new Set(selectedIds());
            setSelectedIds(allGroupIds().filter((id) => !cur.has(id)));
          }}
        />

        <div class="max-h-64 overflow-y-auto overscroll-contain rounded-md border border-border/50 bg-muted/20 p-1 mx-6">
          <Show
            when={pickableGroups().length > 0}
            fallback={
              <p class="px-2 py-3 text-sm text-muted-foreground">暂无自定义分组</p>
            }
          >
            <ul class="space-y-0.5">
              <For each={pickableGroups()}>
                {(g) => (
                  <li>
                    <label class={listItemClass}>
                      <Checkbox
                        checked={selectedIds().includes(g.groupId)}
                        onChange={() => toggleGroupId(g.groupId)}
                      />
                      <span class="min-w-0 truncate">{g.groupName}</span>
                    </label>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>

        <AppDialogFooter>
          <Button variant="outline" type="button" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={selectedIds().length === 0}
            onClick={handleConfirm}
          >
            确定
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

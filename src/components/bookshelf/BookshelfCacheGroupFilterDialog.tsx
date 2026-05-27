/**
 * 离线缓存页：多选书架分组（复选框）
 */

import { For, Show, createEffect, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import type { BookGroup } from '@/types';

export interface BookshelfCacheGroupFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userGroups: BookGroup[];
  appliedGroupIds: number[];
  onApply: (groupIds: number[]) => void;
}

const listItemClass =
  'flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent/40';

function FilterSectionActions(props: {
  selectedCount: () => number;
  totalCount: () => number;
  onSelectAll: () => void;
  onClear: () => void;
  onInvert: () => void;
}) {
  const allSelected = () =>
    props.totalCount() > 0 && props.selectedCount() === props.totalCount();

  return (
    <div class="flex min-w-0 items-start justify-between gap-x-2 gap-y-1">
      <Label class="shrink-0 self-start text-sm font-medium leading-7 text-foreground">
        分组
      </Label>
      <div class="flex min-w-0 flex-1 flex-wrap items-start justify-end gap-1">
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
    </div>
  );
}

export function BookshelfCacheGroupFilterDialog(
  props: BookshelfCacheGroupFilterDialogProps,
) {
  const bookGroups = () => props.userGroups.filter((g) => g.groupId > 0);
  const allGroupIds = () => bookGroups().map((g) => g.groupId);
  const [draftGroupIds, setDraftGroupIds] = createSignal<number[]>([]);

  createEffect(() => {
    if (!props.open) return;
    setDraftGroupIds([...props.appliedGroupIds]);
  });

  function toggleGroupId(id: number) {
    setDraftGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent layout="plain">
        <AppDialogHeader>
          <AppDialogTitle>筛选书架分组</AppDialogTitle>
          <AppDialogDescription>
            勾选要显示的书籍分组；不勾选表示显示全部分组的书籍。
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="flex flex-col gap-2 px-6 py-1">
          <FilterSectionActions
            selectedCount={() => draftGroupIds().length}
            totalCount={() => bookGroups().length}
            onSelectAll={() => setDraftGroupIds(allGroupIds())}
            onClear={() => setDraftGroupIds([])}
            onInvert={() => {
              const cur = new Set(draftGroupIds());
              setDraftGroupIds(allGroupIds().filter((id) => !cur.has(id)));
            }}
          />
          <div class="max-h-[min(16rem,50vh)] overflow-y-auto overscroll-contain rounded-md border border-border/50 bg-muted/20 p-1">
            <Show
              when={bookGroups().length > 0}
              fallback={
                <p class="px-2 py-3 text-sm text-muted-foreground">暂无自定义分组</p>
              }
            >
              <ul class="space-y-0.5">
                <For each={bookGroups()}>
                  {(g) => (
                    <li>
                      <label class={listItemClass}>
                        <Checkbox
                          checked={draftGroupIds().includes(g.groupId)}
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
        </div>
        <AppDialogFooter class="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => {
              props.onApply(draftGroupIds());
              props.onOpenChange(false);
            }}
          >
            确定
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

/**
 * 书架管理：筛选规则（分组 / 来源复选框列表）
 */

import { For, Show, createSignal, createEffect } from 'solid-js';
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
import { cn } from '@/lib/utils';
import type { BookGroup } from '@/types';

export interface BookshelfManageFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterByBookGroup: boolean;
  filterBySource: boolean;
  userGroups: BookGroup[];
  sourceNames: string[];
  appliedBookGroupIds: number[];
  appliedSourceNames: string[];
  onApply: (bookGroupIds: number[], sourceNames: string[]) => void;
}

const listItemClass =
  'flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent/40';

function FilterSectionActions(props: {
  label: string;
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
        {props.label}
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

export function BookshelfManageFilterDialog(props: BookshelfManageFilterDialogProps) {
  const [draftGroupIds, setDraftGroupIds] = createSignal<number[]>([]);
  const [draftSourceNames, setDraftSourceNames] = createSignal<string[]>([]);

  const bookGroups = () => props.userGroups.filter((g) => g.groupId > 0);
  const bothEnabled = () => props.filterByBookGroup && props.filterBySource;

  const allGroupIds = () => bookGroups().map((g) => g.groupId);

  createEffect(() => {
    if (!props.open) return;
    setDraftGroupIds([...props.appliedBookGroupIds]);
    setDraftSourceNames([...props.appliedSourceNames]);
  });

  function toggleGroupId(id: number) {
    setDraftGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSourceName(name: string) {
    setDraftSourceNames((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
  }

  function handleConfirm() {
    props.onApply(
      props.filterByBookGroup ? draftGroupIds() : [],
      props.filterBySource ? draftSourceNames() : [],
    );
    props.onOpenChange(false);
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>筛选</AppDialogTitle>
          <AppDialogDescription>
            勾选要保留的分组或来源；不勾选表示该维度不限制。
          </AppDialogDescription>
        </AppDialogHeader>

        <div
          class={cn(
            'min-h-0 gap-4 px-6',
            bothEnabled() ? 'grid sm:grid-cols-2' : 'flex flex-col',
          )}
        >
          <Show when={props.filterByBookGroup}>
            <div class="flex min-w-0 flex-col gap-2">
              <FilterSectionActions
                label="分组"
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
          </Show>

          <Show when={props.filterBySource}>
            <div class="flex min-w-0 flex-col gap-2">
              <FilterSectionActions
                label="来源"
                selectedCount={() => draftSourceNames().length}
                totalCount={() => props.sourceNames.length}
                onSelectAll={() => setDraftSourceNames([...props.sourceNames])}
                onClear={() => setDraftSourceNames([])}
                onInvert={() => {
                  const cur = new Set(draftSourceNames());
                  setDraftSourceNames(
                    props.sourceNames.filter((name) => !cur.has(name)),
                  );
                }}
              />
              <div class="max-h-[min(16rem,50vh)] overflow-y-auto overscroll-contain rounded-md border border-border/50 bg-muted/20 p-1">
                <Show
                  when={props.sourceNames.length > 0}
                  fallback={
                    <p class="px-2 py-3 text-sm text-muted-foreground">暂无书源</p>
                  }
                >
                  <ul class="space-y-0.5">
                    <For each={props.sourceNames}>
                      {(name) => (
                        <li>
                          <label class={listItemClass}>
                            <Checkbox
                              checked={draftSourceNames().includes(name)}
                              onChange={() => toggleSourceName(name)}
                            />
                            <span class="min-w-0 truncate">{name}</span>
                          </label>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </div>
          </Show>
        </div>

        <AppDialogFooter>
          <Button variant="outline" type="button" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleConfirm}>
            确定
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

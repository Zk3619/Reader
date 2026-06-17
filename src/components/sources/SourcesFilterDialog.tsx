/**
 * 书源筛选：书源分组（虚拟列表）+ 其他条件
 * 布局对齐 BookshelfManageFilterDialog：纵向分块，各块独立 max-h 滚动。
 */

import { Show, createSignal, createEffect } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  AppDialog,
  AppDialogScrollBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { VirtualChapterList } from '@/components/books/VirtualChapterList';
import {
  SOURCE_ENABLED_FILTER_OPTIONS,
  SOURCE_SPECIAL_FILTER_OPTIONS,
  UNGROUPED_SOURCE_LABEL,
  EMPTY_SOURCE_LIST_FILTER,
  type SourceListFilterCriteria,
  type SourceEnabledFilter,
  type SourceSpecialFilter,
} from '@/lib/sources/source-list-filter';
import { cn } from '@/lib/utils';
import { dialogNestedScrollFrame, dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';

/** 分组列表可视高度（虚拟列表须固定高度，不可用 flex-1 撑开） */
const GROUP_LIST_VIEWPORT_CLASS = 'h-64 max-h-[50vh] shrink-0';

export interface SourcesFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceGroups: string[];
  appliedFilter: SourceListFilterCriteria;
  onApply: (criteria: SourceListFilterCriteria) => void;
}

const GROUP_ROW_HEIGHT = 40;
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

export function SourcesFilterDialog(props: SourcesFilterDialogProps) {
  const [draft, setDraft] = createSignal<SourceListFilterCriteria>(EMPTY_SOURCE_LIST_FILTER);

  const groupOptions = () => {
    const names = new Set(props.sourceGroups.filter(Boolean));
    names.add(UNGROUPED_SOURCE_LABEL);
    return [...names].sort((a, b) =>
      a === UNGROUPED_SOURCE_LABEL ? 1 : b === UNGROUPED_SOURCE_LABEL ? -1 : a.localeCompare(b, 'zh-CN'),
    );
  };

  createEffect(() => {
    if (!props.open) return;
    const applied = props.appliedFilter;
    setDraft({
      groupNames: [...applied.groupNames],
      enabledStates: [...applied.enabledStates],
      specialFilters: [...applied.specialFilters],
    });
  });

  function patchDraft(partial: Partial<SourceListFilterCriteria>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  function toggleGroup(name: string) {
    setDraft((prev) => ({
      ...prev,
      groupNames: prev.groupNames.includes(name)
        ? prev.groupNames.filter((x) => x !== name)
        : [...prev.groupNames, name],
    }));
  }

  function toggleEnabled(value: SourceEnabledFilter) {
    setDraft((prev) => ({
      ...prev,
      enabledStates: prev.enabledStates.includes(value)
        ? prev.enabledStates.filter((x) => x !== value)
        : [...prev.enabledStates, value],
    }));
  }

  function toggleSpecial(value: SourceSpecialFilter) {
    setDraft((prev) => ({
      ...prev,
      specialFilters: prev.specialFilters.includes(value)
        ? prev.specialFilters.filter((x) => x !== value)
        : [...prev.specialFilters, value],
    }));
  }

  function stateFilterSelectedCount() {
    return draft().enabledStates.length + draft().specialFilters.length;
  }

  function stateFilterTotalCount() {
    return SOURCE_ENABLED_FILTER_OPTIONS.length + SOURCE_SPECIAL_FILTER_OPTIONS.length;
  }

  function selectAllStateFilters() {
    patchDraft({
      enabledStates: SOURCE_ENABLED_FILTER_OPTIONS.map((o) => o.value),
      specialFilters: SOURCE_SPECIAL_FILTER_OPTIONS.map((o) => o.value),
    });
  }

  function clearStateFilters() {
    patchDraft({ enabledStates: [], specialFilters: [] });
  }

  function invertStateFilters() {
    const curEnabled = new Set(draft().enabledStates);
    const curSpecial = new Set(draft().specialFilters);
    patchDraft({
      enabledStates: SOURCE_ENABLED_FILTER_OPTIONS.map((o) => o.value).filter(
        (v) => !curEnabled.has(v),
      ),
      specialFilters: SOURCE_SPECIAL_FILTER_OPTIONS.map((o) => o.value).filter(
        (v) => !curSpecial.has(v),
      ),
    });
  }

  function handleConfirm() {
    props.onApply(draft());
    props.onOpenChange(false);
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent layout="app" class="max-w-lg">
        <AppDialogHeader class="shrink-0 px-6 pt-6">
          <AppDialogTitle>筛选</AppDialogTitle>
          <AppDialogDescription>
            勾选要保留的分组或条件；不勾选表示该维度不限制。
          </AppDialogDescription>
        </AppDialogHeader>

        <AppDialogScrollBody frameClass={dialogScrollFrameFlex}>
          <div class="flex flex-col gap-4">
            <div class="flex min-w-0 flex-col gap-2">
              <FilterSectionActions
                label="书源分组"
                selectedCount={() => draft().groupNames.length}
                totalCount={() => groupOptions().length}
                onSelectAll={() => patchDraft({ groupNames: groupOptions() })}
                onClear={() => patchDraft({ groupNames: [] })}
                onInvert={() => {
                  const cur = new Set(draft().groupNames);
                  patchDraft({ groupNames: groupOptions().filter((name) => !cur.has(name)) });
                }}
              />
              <Show
                when={groupOptions().length > 0}
                fallback={
                  <div
                    class={cn(
                      dialogNestedScrollFrame,
                      'px-2 py-3 text-sm text-muted-foreground',
                    )}
                  >
                    暂无书源分组
                  </div>
                }
              >
                <div class={cn(GROUP_LIST_VIEWPORT_CLASS, 'overflow-hidden rounded-md border border-border/50 bg-muted/20')}>
                  <VirtualChapterList
                    class="flex-none! size-full min-h-0 overflow-y-auto p-1"
                    count={groupOptions().length}
                    rowHeight={GROUP_ROW_HEIGHT}
                  >
                    {(index) => {
                      const name = groupOptions()[index];
                      if (!name) return null;
                      return (
                        <label class={cn(listItemClass, 'mb-0.5')}>
                          <Checkbox
                            checked={draft().groupNames.includes(name)}
                            onChange={() => toggleGroup(name)}
                            aria-label={name}
                          />
                          <span class="min-w-0 flex-1 truncate">{name}</span>
                        </label>
                      );
                    }}
                  </VirtualChapterList>
                </div>
              </Show>
            </div>

            <div class="flex min-w-0 flex-col gap-2">
              <FilterSectionActions
                label="其他条件"
                selectedCount={stateFilterSelectedCount}
                totalCount={stateFilterTotalCount}
                onSelectAll={selectAllStateFilters}
                onClear={clearStateFilters}
                onInvert={invertStateFilters}
              />
              <AppDialogScrollBody nested>
                <ul class="space-y-0.5">
                  {SOURCE_ENABLED_FILTER_OPTIONS.map((opt) => (
                    <li>
                      <label class={listItemClass}>
                        <Checkbox
                          checked={draft().enabledStates.includes(opt.value)}
                          onChange={() => toggleEnabled(opt.value)}
                        />
                        <span class="min-w-0 truncate">{opt.label}</span>
                      </label>
                    </li>
                  ))}
                  {SOURCE_SPECIAL_FILTER_OPTIONS.map((opt) => (
                    <li>
                      <label class={listItemClass}>
                        <Checkbox
                          checked={draft().specialFilters.includes(opt.value)}
                          onChange={() => toggleSpecial(opt.value)}
                        />
                        <span class="min-w-0 truncate">{opt.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </AppDialogScrollBody>
            </div>
          </div>
        </AppDialogScrollBody>

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

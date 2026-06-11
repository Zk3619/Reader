/**
 * 订阅源管理筛选：订阅分组（虚拟列表）+ 其他条件
 */

import { Show, createSignal, createEffect } from 'solid-js';
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
import { VirtualChapterList } from '@/components/books/VirtualChapterList';
import { SOURCE_ENABLED_FILTER_OPTIONS } from '@/lib/sources/source-list-filter';
import {
  RSS_SPECIAL_FILTER_OPTIONS,
  EMPTY_RSS_SOURCE_LIST_FILTER,
  buildRssManageFilterGroupOptions,
  buildRssManageFilterDomainOptions,
  type RssSourceListFilterCriteria,
  type RssSourceSpecialFilter,
} from '@/lib/rss/rss-source-list-filter';
import type { SourceEnabledFilter } from '@/lib/sources/source-list-filter';
import type { RssSource } from '@/types';
import { cn } from '@/lib/utils';
import { scrollGutterStableBoth } from '@/lib/ui/viewport-classes';

const GROUP_ROW_HEIGHT = 40;
const GROUP_LIST_VIEWPORT_CLASS = 'h-64 max-h-[50vh] shrink-0';
const listItemClass =
  'flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent/40';
const filterScrollPanelClass =
  'max-h-[min(16rem,50vh)] overflow-y-auto overscroll-contain rounded-md border border-border/50 bg-muted/20 p-1';

export interface RssSourcesManageFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceGroups: string[];
  /** 用于生成域名筛选项 */
  sources: RssSource[];
  appliedFilter: RssSourceListFilterCriteria;
  onApply: (criteria: RssSourceListFilterCriteria) => void;
}

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

export function RssSourcesManageFilterDialog(props: RssSourcesManageFilterDialogProps) {
  const [draft, setDraft] = createSignal<RssSourceListFilterCriteria>(EMPTY_RSS_SOURCE_LIST_FILTER);

  const groupOptions = () => buildRssManageFilterGroupOptions(props.sourceGroups);
  const domainOptions = () => buildRssManageFilterDomainOptions(props.sources);

  createEffect(() => {
    if (!props.open) return;
    const applied = props.appliedFilter;
    setDraft({
      groupNames: [...applied.groupNames],
      domainNames: [...applied.domainNames],
      enabledStates: [...applied.enabledStates],
      specialFilters: [...applied.specialFilters],
    });
  });

  function patchDraft(partial: Partial<RssSourceListFilterCriteria>) {
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

  function toggleDomain(name: string) {
    setDraft((prev) => ({
      ...prev,
      domainNames: prev.domainNames.includes(name)
        ? prev.domainNames.filter((x) => x !== name)
        : [...prev.domainNames, name],
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

  function toggleSpecial(value: RssSourceSpecialFilter) {
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
    return SOURCE_ENABLED_FILTER_OPTIONS.length + RSS_SPECIAL_FILTER_OPTIONS.length;
  }

  function selectAllStateFilters() {
    patchDraft({
      enabledStates: SOURCE_ENABLED_FILTER_OPTIONS.map((o) => o.value),
      specialFilters: RSS_SPECIAL_FILTER_OPTIONS.map((o) => o.value),
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
      specialFilters: RSS_SPECIAL_FILTER_OPTIONS.map((o) => o.value).filter(
        (v) => !curSpecial.has(v),
      ),
    });
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent layout="app" class="max-h-[85dvh]! w-full max-w-lg">
        <AppDialogHeader class="shrink-0 px-6 pt-6">
          <AppDialogTitle>筛选</AppDialogTitle>
          <AppDialogDescription>
            勾选要保留的分组或条件；不勾选表示该维度不限制。
          </AppDialogDescription>
        </AppDialogHeader>

        <div
          class={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4',
            scrollGutterStableBoth,
          )}
        >
          <div class="flex flex-col gap-4">
            <div class="flex min-w-0 flex-col gap-2">
              <FilterSectionActions
                label="订阅分组"
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
                  <div class={cn(filterScrollPanelClass, 'px-2 py-3 text-sm text-muted-foreground')}>
                    暂无订阅分组
                  </div>
                }
              >
                <div
                  class={cn(
                    GROUP_LIST_VIEWPORT_CLASS,
                    'overflow-hidden rounded-md border border-border/50 bg-muted/20',
                  )}
                >
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
                label="域名"
                selectedCount={() => draft().domainNames.length}
                totalCount={() => domainOptions().length}
                onSelectAll={() => patchDraft({ domainNames: domainOptions() })}
                onClear={() => patchDraft({ domainNames: [] })}
                onInvert={() => {
                  const cur = new Set(draft().domainNames);
                  patchDraft({ domainNames: domainOptions().filter((name) => !cur.has(name)) });
                }}
              />
              <Show
                when={domainOptions().length > 0}
                fallback={
                  <div class={cn(filterScrollPanelClass, 'px-2 py-3 text-sm text-muted-foreground')}>
                    暂无域名
                  </div>
                }
              >
                <div
                  class={cn(
                    GROUP_LIST_VIEWPORT_CLASS,
                    'overflow-hidden rounded-md border border-border/50 bg-muted/20',
                  )}
                >
                  <VirtualChapterList
                    class="flex-none! size-full min-h-0 overflow-y-auto p-1"
                    count={domainOptions().length}
                    rowHeight={GROUP_ROW_HEIGHT}
                  >
                    {(index) => {
                      const name = domainOptions()[index];
                      if (!name) return null;
                      return (
                        <label class={cn(listItemClass, 'mb-0.5')}>
                          <Checkbox
                            checked={draft().domainNames.includes(name)}
                            onChange={() => toggleDomain(name)}
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
              <div class={filterScrollPanelClass}>
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
                  {RSS_SPECIAL_FILTER_OPTIONS.map((opt) => (
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
              </div>
            </div>
          </div>
        </div>

        <AppDialogFooter>
          <Button variant="outline" type="button" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => {
              props.onApply(draft());
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

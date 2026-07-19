/**
 * 搜索范围选择（对齐 Legado SearchScopeDialog）
 * 分组 / 书源 Tab、虚拟列表、批量操作、搜索与模糊筛选
 */

import { createSignal, createEffect, createMemo, Show, type Accessor } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VirtualChapterList } from '@/components/media/reader/books/VirtualChapterList';
import { SearchIcon } from '@/components/shared/icons';
import { getEnabledSources } from '@/lib/database/sources';
import {
  buildSearchScopeGroupItems,
  collectSourceGroupNames,
  formatSourceScope,
  formatSourceScopes,
  isSourceScope,
  loadSearchScopeFuzzy,
  loadSearchScopeTab,
  parseSourceScopes,
  saveSearchScopeFuzzy,
  saveSearchScopeTab,
  scopeDisplayNames,
  type SearchScopeTab,
} from '@/lib/book-source/search-scope';
import { fuzzyMatchQuery } from '@/lib/sources/source-list-filter';
import { cn } from '@/lib/utils';
import { dialogVirtualListPanelWidth } from '@/lib/ui/viewport-classes';
import type { BookSource } from '@/types';

const ROW_HEIGHT = 40;
const LIST_ITEM_CLASS =
  'flex h-10 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm hover:bg-accent/40';

export interface BookSearchScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: string;
  onConfirm: (scope: string) => void;
}

function ScopeBatchActions(props: {
  selectedCount: Accessor<number>;
  totalCount: Accessor<number>;
  onSelectAll: () => void;
  onClear: () => void;
  onInvert: () => void;
}) {
  const allSelected = () =>
    props.totalCount() > 0 && props.selectedCount() === props.totalCount();

  return (
    <div class="flex min-w-0 flex-wrap items-center gap-1">
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

function ScopeSearchToolbar(props: {
  placeholder: string;
  searchQuery: Accessor<string>;
  onSearchQuery: (v: string) => void;
  fuzzySearch: Accessor<boolean>;
  onFuzzySearch: (v: boolean) => void;
  batch: {
    selectedCount: Accessor<number>;
    totalCount: Accessor<number>;
    onSelectAll: () => void;
    onClear: () => void;
    onInvert: () => void;
  };
}) {
  return (
    <div class="shrink-0 space-y-2 border-b border-border/50 px-4 py-3">
      <div class="flex items-center gap-2">
        <div class="relative flex min-w-0 flex-1 items-center">
          <SearchIcon class="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={props.placeholder}
            value={props.searchQuery()}
            onInput={(e) => props.onSearchQuery(e.currentTarget.value)}
            class="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div class="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap">
          <Checkbox
            id={`scope-fuzzy-${props.placeholder}`}
            checked={props.fuzzySearch()}
            onChange={(checked) => props.onFuzzySearch(checked)}
            aria-label="模糊搜索"
          />
          <Label
            for={`scope-fuzzy-${props.placeholder}`}
            class="cursor-pointer text-sm text-muted-foreground"
          >
            模糊搜索
          </Label>
        </div>
      </div>
      <ScopeBatchActions {...props.batch} />
    </div>
  );
}

function VirtualCheckboxRows(props: {
  count: Accessor<number>;
  isChecked: (index: number) => boolean;
  label: (index: number) => string;
  onToggle: (index: number) => void;
  emptyText: Accessor<string>;
  loading: Accessor<boolean>;
}) {
  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Show when={props.loading()}>
        <p class="px-4 py-8 text-center text-sm text-muted-foreground">加载中…</p>
      </Show>
      <Show when={!props.loading() && props.count() === 0}>
        <p class="px-4 py-8 text-center text-sm text-muted-foreground">{props.emptyText()}</p>
      </Show>
      <Show when={!props.loading() && props.count() > 0}>
        <VirtualChapterList
          class="min-h-0 flex-1 px-2 py-1"
          count={props.count()}
          rowHeight={ROW_HEIGHT}
        >
          {(index) => (
            <label class={cn(LIST_ITEM_CLASS, 'mb-0.5')}>
              <Checkbox
                checked={props.isChecked(index)}
                onChange={() => props.onToggle(index)}
                aria-label={props.label(index)}
              />
              <span class="min-w-0 flex-1 truncate">{props.label(index)}</span>
            </label>
          )}
        </VirtualChapterList>
      </Show>
    </div>
  );
}

export function BookSearchScopeDialog(props: BookSearchScopeDialogProps) {
  const [tab, setTab] = createSignal<SearchScopeTab>('group');

  const changeTab = (next: SearchScopeTab) => {
    setTab(next);
    saveSearchScopeTab(next);
  };

  const setGroupFuzzyPersist = (enabled: boolean) => {
    setGroupFuzzy(enabled);
    saveSearchScopeFuzzy('group', enabled);
  };

  const setSourceFuzzyPersist = (enabled: boolean) => {
    setSourceFuzzy(enabled);
    saveSearchScopeFuzzy('source', enabled);
  };
  const [loading, setLoading] = createSignal(true);
  const [enabledSources, setEnabledSources] = createSignal<BookSource[]>([]);
  const [selectedGroups, setSelectedGroups] = createSignal<string[]>([]);
  const [selectedSourceUrls, setSelectedSourceUrls] = createSignal<Set<string>>(new Set<string>());
  const [groupSearch, setGroupSearch] = createSignal('');
  const [sourceSearch, setSourceSearch] = createSignal('');
  const [groupFuzzy, setGroupFuzzy] = createSignal(false);
  const [sourceFuzzy, setSourceFuzzy] = createSignal(false);

  const groupNames = createMemo(() => collectSourceGroupNames(enabledSources()));
  const allGroupItems = createMemo(() =>
    buildSearchScopeGroupItems(enabledSources(), groupNames()),
  );

  const filteredGroups = createMemo(() => {
    const q = groupSearch().trim().toLowerCase();
    const list = allGroupItems();
    if (!q) return list;
    const fuzzy = groupFuzzy();
    return list.filter((name) =>
      fuzzy ? fuzzyMatchQuery(q, name) : name.toLowerCase().includes(q),
    );
  });

  const filteredSources = createMemo(() => {
    const q = sourceSearch().trim().toLowerCase();
    const list = enabledSources();
    if (!q) return list;
    const fuzzy = sourceFuzzy();
    return list.filter((s) => {
      const hay = `${s.sourceName}\n${s.sourceUrl}\n${s.sourceGroup ?? ''}`;
      return fuzzy ? fuzzyMatchQuery(q, hay) : hay.toLowerCase().includes(q);
    });
  });

  function initSelectionsFromScope(scope: string, sources: BookSource[]) {
    const trimmed = scope.trim();
    if (!trimmed) {
      setSelectedGroups([]);
      setSelectedSourceUrls(new Set<string>());
      return;
    }
    if (isSourceScope(trimmed)) {
      const parts = parseSourceScopes(trimmed);
      const urls = new Set<string>(
        parts.map((p) => p.url).filter((url) => sources.some((s) => s.sourceUrl === url)),
      );
      setSelectedSourceUrls(urls);
      setSelectedGroups([]);
      return;
    }
    setSelectedGroups(scopeDisplayNames(trimmed));
    setSelectedSourceUrls(new Set<string>());
  }

  createEffect(() => {
    if (!props.open) return;
    void (async () => {
      setLoading(true);
      setGroupSearch('');
      setSourceSearch('');
      try {
        const sources = await getEnabledSources();
        const lastTab = loadSearchScopeTab();
        setEnabledSources(sources);
        setTab(lastTab);
        setGroupFuzzy(loadSearchScopeFuzzy('group'));
        setSourceFuzzy(loadSearchScopeFuzzy('source'));
        initSelectionsFromScope(props.scope, sources);
      } finally {
        setLoading(false);
      }
    })();
  });

  const isGroupChecked = (index: number) => {
    const name = filteredGroups()[index];
    return name ? selectedGroups().includes(name) : false;
  };

  const toggleGroupAt = (index: number) => {
    const name = filteredGroups()[index];
    if (!name) return;
    setSelectedGroups((prev) =>
      prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name],
    );
  };

  const filteredSelectedGroupCount = () =>
    filteredGroups().filter((g) => selectedGroups().includes(g)).length;

  const allFilteredGroupsSelected = () => {
    const f = filteredGroups();
    return f.length > 0 && f.every((g) => selectedGroups().includes(g));
  };

  const toggleSelectAllGroups = () => {
    const filtered = filteredGroups();
    if (allFilteredGroupsSelected()) {
      const remove = new Set(filtered);
      setSelectedGroups((prev) => prev.filter((g) => !remove.has(g)));
    } else {
      setSelectedGroups((prev) => {
        const set = new Set(prev);
        filtered.forEach((g) => set.add(g));
        return [...set];
      });
    }
  };

  const clearGroups = () => setSelectedGroups([]);
  const invertGroups = () => {
    const filtered = filteredGroups();
    setSelectedGroups((prev) => {
      const next = prev.filter((g) => !filtered.includes(g));
      for (const g of filtered) {
        if (!prev.includes(g)) next.push(g);
      }
      return next;
    });
  };

  const isSourceChecked = (index: number) => {
    const s = filteredSources()[index];
    return s ? selectedSourceUrls().has(s.sourceUrl) : false;
  };

  const toggleSourceAt = (index: number) => {
    const s = filteredSources()[index];
    if (!s) return;
    setSelectedSourceUrls((prev) => {
      const next = new Set(prev);
      if (next.has(s.sourceUrl)) next.delete(s.sourceUrl);
      else next.add(s.sourceUrl);
      return next;
    });
  };

  const filteredSelectedSourceCount = () =>
    filteredSources().filter((s) => selectedSourceUrls().has(s.sourceUrl)).length;

  const allFilteredSourcesSelected = () => {
    const f = filteredSources();
    return f.length > 0 && f.every((s) => selectedSourceUrls().has(s.sourceUrl));
  };

  const toggleSelectAllSources = () => {
    const filtered = filteredSources();
    if (allFilteredSourcesSelected()) {
      setSelectedSourceUrls((prev) => {
        const remove = new Set(filtered.map((s) => s.sourceUrl));
        const next = new Set(prev);
        remove.forEach((url) => next.delete(url));
        return next;
      });
    } else {
      setSelectedSourceUrls((prev) => {
        const next = new Set(prev);
        filtered.forEach((s) => next.add(s.sourceUrl));
        return next;
      });
    }
  };

  const clearSources = () => setSelectedSourceUrls(new Set<string>());
  const invertSources = () => {
    const filtered = filteredSources();
    setSelectedSourceUrls((prev) => {
      const next = new Set<string>(prev);
      for (const s of filtered) {
        if (next.has(s.sourceUrl)) next.delete(s.sourceUrl);
        else next.add(s.sourceUrl);
      }
      return next;
    });
  };

  const persistTabAndClose = () => {
    saveSearchScopeTab(tab());
    props.onOpenChange(false);
  };

  const confirmAllSources = () => {
    props.onConfirm('');
    persistTabAndClose();
  };

  const confirm = () => {
    if (tab() === 'group') {
      const all = allGroupItems();
      const sel = selectedGroups();
      if (sel.length === 0 || sel.length === all.length) {
        props.onConfirm('');
      } else {
        props.onConfirm(sel.join(','));
      }
    } else {
      const all = enabledSources();
      const urls = selectedSourceUrls();
      if (urls.size === 0 || urls.size === all.length) {
        props.onConfirm('');
      } else {
        const picked = all.filter((s) => urls.has(s.sourceUrl));
        if (picked.length === 1) {
          props.onConfirm(formatSourceScope(picked[0]!));
        } else {
          props.onConfirm(formatSourceScopes(picked));
        }
      }
    }
    saveSearchScopeTab(tab());
    props.onOpenChange(false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent
        layout="app"
        class={cn(
          dialogVirtualListPanelWidth,
          'flex h-[min(85dvh,560px)] flex-col gap-0 overflow-hidden p-0',
        )}
      >
        <AppDialogHeader class="shrink-0 px-6 pt-6">
          <AppDialogTitle>搜索范围</AppDialogTitle>
          <AppDialogDescription class="text-sm text-muted-foreground">
            不选或全选均表示全部启用书源；分组 Tab 含未分组书源。
          </AppDialogDescription>
        </AppDialogHeader>

        <Tabs
          value={tab()}
          onChange={(v) => changeTab(v as SearchScopeTab)}
          class="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-2"
        >
          <TabsList class="grid w-full shrink-0 grid-cols-2">
            <TabsTrigger value="group">分组</TabsTrigger>
            <TabsTrigger value="source">书源</TabsTrigger>
          </TabsList>

          <TabsContent value="group" class="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden data-selected:flex">
            <ScopeSearchToolbar
              placeholder="搜索分组"
              searchQuery={groupSearch}
              onSearchQuery={setGroupSearch}
              fuzzySearch={groupFuzzy}
              onFuzzySearch={setGroupFuzzyPersist}
              batch={{
                selectedCount: filteredSelectedGroupCount,
                totalCount: () => filteredGroups().length,
                onSelectAll: toggleSelectAllGroups,
                onClear: clearGroups,
                onInvert: invertGroups,
              }}
            />
            <VirtualCheckboxRows
              loading={loading}
              count={() => filteredGroups().length}
              isChecked={isGroupChecked}
              label={(i) => filteredGroups()[i] ?? ''}
              onToggle={toggleGroupAt}
              emptyText={() =>
                groupSearch().trim() ? '无匹配分组' : '暂无书源分组，将搜索全部启用书源'
              }
            />
          </TabsContent>

          <TabsContent value="source" class="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden data-selected:flex">
            <ScopeSearchToolbar
              placeholder="搜索书源"
              searchQuery={sourceSearch}
              onSearchQuery={setSourceSearch}
              fuzzySearch={sourceFuzzy}
              onFuzzySearch={setSourceFuzzyPersist}
              batch={{
                selectedCount: filteredSelectedSourceCount,
                totalCount: () => filteredSources().length,
                onSelectAll: toggleSelectAllSources,
                onClear: clearSources,
                onInvert: invertSources,
              }}
            />
            <VirtualCheckboxRows
              loading={loading}
              count={() => filteredSources().length}
              isChecked={isSourceChecked}
              label={(i) => filteredSources()[i]?.sourceName ?? ''}
              onToggle={toggleSourceAt}
              emptyText={() =>
                sourceSearch().trim() ? '无匹配书源' : '暂无启用的书源'
              }
            />
          </TabsContent>
        </Tabs>

        <AppDialogFooter class="shrink-0 flex-wrap gap-2 border-t border-border/50 px-4 py-3 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={confirmAllSources}>
            全部书源
          </Button>
          <div class="flex gap-2">
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              取消
            </Button>
            <Button type="button" onClick={confirm}>
              确定
            </Button>
          </div>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

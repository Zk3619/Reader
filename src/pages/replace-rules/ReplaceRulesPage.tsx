/**
 * 替换净化规则管理（对齐 Legado ReplaceRuleActivity + TXT 目录规则页交互）
 */

import { createMemo, createSignal, For, Show } from 'solid-js';
import { useChunkedFilter } from '@/lib/hooks/useChunkedFilter';
import * as replaceDb from '@/lib/database/replace-rules';
import { invalidateReplaceRulesCache } from '@/lib/book-source/content-processor';
import { parseReplaceRuleImportItems } from '@/lib/book-source/import-replace-rule';
import {
  buildImportReplaceRuleComparisons,
  defaultImportReplaceRuleSelection,
  importSelectedReplaceRules,
  resolveReplaceRulesFromNetworkUrl,
  resolveReplaceRulesFromText,
  type ImportReplaceRuleComparison,
} from '@/lib/book-source/import-replace-rule-resolver';
import {
  replaceRuleMatchesListFilter,
  replaceRuleGroupFilterKey,
  replaceRuleGroupFilterTitle,
  type ReplaceRuleGroupFilter,
  UNGROUPED_REPLACE_RULE_LABEL,
} from '@/lib/replace-rules/filter-replace-rules';
import { ReplaceRuleListItem } from '@/components/replace-rules/ReplaceRuleListItem';
import { VirtualRuleManageList } from '@/components/replace-rules/VirtualRuleManageList';
import type { VirtualListSortableConfig } from '@/components/shared/virtual-list';
import type { Id } from '@thisbeyond/solid-dnd';
import type { ImportReplaceRuleOptions } from '@/lib/book-source/import-replace-rule-resolver';
import { ImportReplaceRuleSelectDialog } from '@/components/replace-rules/ImportReplaceRuleSelectDialog';
import {
  ReplaceRuleEditDialog,
  type ReplaceRuleDraft,
} from '@/components/replace-rules/ReplaceRuleEditDialog';
import {
  ReplaceRulesPageToolbar,
  ReplaceRulesToolbarLeading,
} from '@/components/replace-rules/ReplaceRulesPageToolbar';
import { ImportSourceQrDialog } from '@/components/sources/ImportSourceQrDialog';
import { ImportCodeDialog } from '@/components/shared/ImportCodeDialog';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { parseReaderImportDeepLink } from '@/lib/platform/legado-import-uri';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';
import type { ReplaceRule } from '@/types';
import { Button } from '@/components/ui/button';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import {
  AppDropdownMenu,
  AppDropdownMenuButtonTrigger,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { showAppToast } from '@/components/shared/AppToasts';
import { ChevronDownIcon, LinkIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';

const BATCH_MENU_TRIGGER_CLASS = 'gap-1.5 group/trigger';
const BATCH_MENU_CHEVRON_CLASS =
  'h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-data-expanded/trigger:rotate-180';

function emptyRule(): Omit<ReplaceRule, 'id'> {
  return {
    name: '新规则',
    pattern: '',
    replacement: '',
    scopeContent: true,
    scopeTitle: false,
    isEnabled: true,
    isRegex: true,
    timeoutMillisecond: 3000,
    order: 0,
  };
}

export interface ReplaceRulesPageProps {
  onBack?: () => void;
}

export function ReplaceRulesPage(props: ReplaceRulesPageProps) {
  const [rules, setRules] = createSignal<ReplaceRule[]>([]);
  const [ruleGroups, setRuleGroups] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [groupFilter, setGroupFilter] = createSignal<ReplaceRuleGroupFilter>({ kind: 'all' });
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  const [editOpen, setEditOpen] = createSignal(false);
  const [editingRule, setEditingRule] = createSignal<ReplaceRuleDraft | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = createSignal(false);
  const [importUrlOpen, setImportUrlOpen] = createSignal(false);
  const [importUrl, setImportUrl] = createSignal('');
  const [qrImportOpen, setQrImportOpen] = createSignal(false);
  const [codeImportOpen, setCodeImportOpen] = createSignal(false);
  const [importSelectOpen, setImportSelectOpen] = createSignal(false);
  const [importLoading, setImportLoading] = createSignal(false);
  const [importComparisons, setImportComparisons] = createSignal<ImportReplaceRuleComparison[]>([]);
  const [importSelectedKeys, setImportSelectedKeys] = createSignal(new Set<string>());
  const [importKeepGroup, setImportKeepGroup] = createSignal(true);
  const [importKeepEnable, setImportKeepEnable] = createSignal(true);
  const [importGroupName, setImportGroupName] = createSignal('');
  const [importAdjustGroup, setImportAdjustGroup] = createSignal(false);

  const filterDeps = createMemo(() => ({
    query: searchQuery(),
    groupFilter: groupFilter(),
  }));

  const isFilterPassThrough = () =>
    !filterDeps().query.trim() && filterDeps().groupFilter.kind === 'all';

  const { filtered: filteredRules, filtering, progressText: filterProgressText } = useChunkedFilter({
    items: rules,
    deps: () => filterDeps(),
    isPassThrough: isFilterPassThrough,
    match: (rule) =>
      replaceRuleMatchesListFilter(rule, filterDeps().query, filterDeps().groupFilter),
    progressLabel: '正在筛选规则',
  });
  const listSortableEnabled = createMemo(
    () =>
      groupFilter().kind === 'all' &&
      !searchQuery().trim() &&
      filteredRules().length === rules().length,
  );

  const groupCounts = createMemo(() => {
    const all = rules();
    const byGroup = new Map<string, number>();
    let ungrouped = 0;
    let enabled = 0;
    let disabled = 0;
    for (const rule of all) {
      if (rule.isEnabled) enabled += 1;
      else disabled += 1;
      const group = rule.group?.trim();
      if (!group || group.includes(UNGROUPED_REPLACE_RULE_LABEL)) {
        ungrouped += 1;
      } else {
        byGroup.set(group, (byGroup.get(group) ?? 0) + 1);
      }
    }
    return { all: all.length, enabled, disabled, ungrouped, byGroup };
  });

  const importGroupOptions = createMemo(() => {
    const names = new Set(ruleGroups());
    for (const c of importComparisons()) {
      const g = c.item.rule.group?.trim();
      if (g) names.add(g);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  });

  const selectedCount = () => selectedIds().size;
  const filteredSelectedCount = () =>
    filteredRules().filter((r) => selectedIds().has(r.id)).length;
  const allFilteredSelected = () =>
    filteredRules().length > 0 && filteredSelectedCount() === filteredRules().length;

  const reload = async () => {
    setLoading(true);
    try {
      const [all, groups] = await Promise.all([
        replaceDb.getAllReplaceRules(),
        replaceDb.getAllRuleGroups(),
      ]);
      setRules(all);
      setRuleGroups(groups.sort((a, b) => a.localeCompare(b, 'zh-CN')));
    } finally {
      setLoading(false);
    }
  };

  const clearSelection = () => setSelectedIds(new Set<number>());

  const toggleSelection = (id: number) => {
    const next = new Set(selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectedRules = () => rules().filter((r) => selectedIds().has(r.id));

  const openNew = () => {
    setEditingRule(emptyRule());
    setEditOpen(true);
  };

  const openEdit = (rule: ReplaceRule) => {
    setEditingRule({ ...rule });
    setEditOpen(true);
  };

  const saveRule = async (rule: ReplaceRuleDraft) => {
    const all = rules();
    const order =
      rule.order ||
      (all.length > 0 ? Math.max(...all.map((r) => r.order)) + 1 : 0);
    if ('id' in rule && rule.id) {
      await replaceDb.updateReplaceRule({ ...(rule as ReplaceRule), order });
    } else {
      await replaceDb.insertReplaceRule({ ...(rule as Omit<ReplaceRule, 'id'>), id: 0, order });
    }
    invalidateReplaceRulesCache();
    await reload();
    showAppToast({ title: '已保存' });
  };

  const finishImport = async (count: number) => {
    if (count > 0) {
      invalidateReplaceRulesCache();
      await reload();
      showAppToast({ title: `已导入 ${count} 条规则` });
      return true;
    }
    showAppToast({ title: '未识别到有效规则', variant: 'destructive' });
    return false;
  };

  const beginImportSelect = async (text: string) => {
    const items = await resolveReplaceRulesFromText(text);
    if (items.length === 0) {
      showAppToast({ title: '未识别到有效规则', variant: 'destructive' });
      return;
    }
    setImportLoading(true);
    setImportSelectOpen(true);
    try {
      const comparisons = await buildImportReplaceRuleComparisons(items);
      setImportComparisons(comparisons);
      setImportSelectedKeys(defaultImportReplaceRuleSelection(comparisons));
    } finally {
      setImportLoading(false);
    }
  };

  const confirmImportSelect = async () => {
    const selected = importSelectedKeys();
    const items = importComparisons()
      .filter((c) => selected.has(c.key))
      .map((c) => c.item);
    setImportLoading(true);
    try {
      const count = await importSelectedReplaceRules(items, {
        keepGroup: importKeepGroup(),
        keepEnable: importKeepEnable(),
        groupName: importGroupName(),
        adjustGroup: importAdjustGroup(),
      } satisfies ImportReplaceRuleOptions);
      setImportSelectOpen(false);
      setImportComparisons([]);
      setImportSelectedKeys(new Set<string>());
      await finishImport(count);
    } finally {
      setImportLoading(false);
    }
  };

  const importLocalJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await beginImportSelect(await file.text());
    };
    input.click();
  };

  const importFromNetworkUrl = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) {
      showAppToast({ title: '请输入规则 URL', variant: 'destructive' });
      return false;
    }
    try {
      const items = await resolveReplaceRulesFromNetworkUrl(trimmed);
      if (items.length === 0) {
        showAppToast({ title: '未识别到有效规则', variant: 'destructive' });
        return false;
      }
      setImportLoading(true);
      setImportSelectOpen(true);
      const comparisons = await buildImportReplaceRuleComparisons(items);
      setImportComparisons(comparisons);
      setImportSelectedKeys(defaultImportReplaceRuleSelection(comparisons));
      setImportLoading(false);
      return true;
    } catch (e) {
      showAppToast({
        title: '导入失败',
        description: e instanceof Error ? e.message : '请检查网络或 URL',
        variant: 'destructive',
      });
      return false;
    }
  };

  const importFromUrl = async () => {
    const ok = await importFromNetworkUrl(importUrl());
    if (ok) {
      setImportUrlOpen(false);
      setImportUrl('');
    }
  };

  const handleRawTextIdentify = async (
    raw: string,
    via: 'qr' | 'code' = 'qr',
    close?: () => void,
  ) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const label = via === 'qr' ? '二维码导入' : '代码导入';

    const parsed = parseReaderImportDeepLink(trimmed);
    if (parsed?.kind === 'replaceRuleNetwork') {
      const ok = await importFromNetworkUrl(parsed.src);
      if (ok) close?.();
      return;
    }
    if (parsed?.kind === 'determineType') {
      const ok = await importFromNetworkUrl(parsed.src);
      if (ok) close?.();
      return;
    }
    if (parsed?.kind === 'unsupported') {
      showAppToast({ title: label, description: parsed.reason, variant: 'default' });
      return;
    }

    const directItems = parseReplaceRuleImportItems(trimmed);
    if (directItems.length > 0) {
      setImportLoading(true);
      setImportSelectOpen(true);
      try {
        const comparisons = await buildImportReplaceRuleComparisons(directItems);
        setImportComparisons(comparisons);
        setImportSelectedKeys(defaultImportReplaceRuleSelection(comparisons));
      } finally {
        setImportLoading(false);
      }
      close?.();
      return;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      const ok = await importFromNetworkUrl(trimmed);
      if (ok) close?.();
      return;
    }

    showAppToast({
      title: via === 'qr' ? '无法识别二维码内容' : '无法识别代码内容',
      description: '请使用替换规则 JSON 或规则链接',
      variant: 'destructive',
    });
  };

  const pageDescription = () => {
    const total = rules().length;
    const filtered = filteredRules().length;
    const parts: string[] = [`共 ${total} 条`];
    if (groupFilter().kind !== 'all' || searchQuery().trim()) {
      parts.push(`筛选 ${filtered} 条`);
    } else {
      parts.push('规则');
    }
    if (listSortableEnabled()) parts.push('可拖拽排序');
    return parts.join(' · ');
  };

  const enableAll = async (enabled: boolean) => {
    await replaceDb.enableAllReplaceRules(enabled);
    invalidateReplaceRulesCache();
    await reload();
    clearSelection();
    showAppToast({ title: enabled ? '已全部启用' : '已全部禁用' });
  };

  const handleRulesReorder = async (orderedIds: Id[]) => {
    try {
      await replaceDb.reorderReplaceRules(orderedIds.map((id) => Number(id)));
      invalidateReplaceRulesCache();
      const byId = new Map(rules().map((r) => [r.id, r]));
      const next = orderedIds
        .map((id) => byId.get(Number(id)))
        .filter((r): r is ReplaceRule => r != null);
      setRules(next);
    } catch (e) {
      showAppToast({
        title: '排序失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
      await reload();
    }
  };

  const listSortable = createMemo(():
    | VirtualListSortableConfig<ReplaceRule>
    | undefined => {
    if (!listSortableEnabled()) return undefined;
    return {
      enabled: listSortableEnabled,
      ids: () => filteredRules().map((r) => r.id),
      onReorder: handleRulesReorder,
      persistOnly: true,
    };
  });

  const batchEnable = async (enabled: boolean) => {
    const ids = selectedRules().map((r) => r.id);
    if (ids.length === 0) return;
    await replaceDb.setReplaceRulesEnabled(ids, enabled);
    invalidateReplaceRulesCache();
    await reload();
    clearSelection();
    showAppToast({ title: enabled ? '已启用所选' : '已禁用所选' });
  };

  const batchDelete = async () => {
    const ids = selectedRules().map((r) => r.id);
    if (ids.length === 0) return;
    await replaceDb.deleteReplaceRules(ids);
    invalidateReplaceRulesCache();
    setDeleteConfirmOpen(false);
    clearSelection();
    await reload();
    showAppToast({ title: '已删除所选规则' });
  };

  const batchExport = () => {
    const selected = selectedRules();
    if (selected.length === 0) return;
    const json = JSON.stringify(selected, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `replaceRule_${selected.length}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showAppToast({ title: `已导出 ${selected.length} 条规则` });
  };

  const batchPinTop = async () => {
    const selected = selectedRules();
    if (selected.length === 0) return;
    await replaceDb.moveReplaceRulesToTop(selected);
    invalidateReplaceRulesCache();
    await reload();
    clearSelection();
    showAppToast({ title: '已置顶所选' });
  };

  const batchPinBottom = async () => {
    const selected = selectedRules();
    if (selected.length === 0) return;
    await replaceDb.moveReplaceRulesToBottom(selected);
    invalidateReplaceRulesCache();
    await reload();
    clearSelection();
    showAppToast({ title: '已置底所选' });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected()) {
      const next = new Set(selectedIds());
      for (const r of filteredRules()) next.delete(r.id);
      setSelectedIds(next);
      return;
    }
    const next = new Set(selectedIds());
    for (const r of filteredRules()) next.add(r.id);
    setSelectedIds(next);
  };

  const invertSelection = () => {
    const next = new Set(selectedIds());
    for (const r of filteredRules()) {
      if (next.has(r.id)) next.delete(r.id);
      else next.add(r.id);
    }
    setSelectedIds(next);
  };

  const activeGroupName = (): string | null => {
    const gf = groupFilter();
    return gf.kind === 'group' ? gf.name : null;
  };

  void reload();

  return (
    <div class={mainShellPageRoot}>
      <PageToolbar
        class="border-b border-border/50 px-3 py-2 sm:px-4"
        title="替换净化"
        description={pageDescription()}
        titleSlot={
          <PageToolbarTitleDropdown
            title={replaceRuleGroupFilterTitle(groupFilter())}
            description={pageDescription()}
            selectionKey={replaceRuleGroupFilterKey(groupFilter())}
            dropdownEnabled={true}
          >
            <AppDropdownMenuItem
              class={cn(groupFilter().kind === 'all' && 'bg-accent/50')}
              onSelect={() => setGroupFilter({ kind: 'all' })}
            >
              全部规则 ({groupCounts().all})
            </AppDropdownMenuItem>
            <AppDropdownMenuItem
              class={cn(groupFilter().kind === 'enabled' && 'bg-accent/50')}
              onSelect={() => setGroupFilter({ kind: 'enabled' })}
            >
              已启用 ({groupCounts().enabled})
            </AppDropdownMenuItem>
            <AppDropdownMenuItem
              class={cn(groupFilter().kind === 'disabled' && 'bg-accent/50')}
              onSelect={() => setGroupFilter({ kind: 'disabled' })}
            >
              已禁用 ({groupCounts().disabled})
            </AppDropdownMenuItem>
            <AppDropdownMenuItem
              class={cn(groupFilter().kind === 'ungrouped' && 'bg-accent/50')}
              onSelect={() => setGroupFilter({ kind: 'ungrouped' })}
            >
              {UNGROUPED_REPLACE_RULE_LABEL} ({groupCounts().ungrouped})
            </AppDropdownMenuItem>
            <For each={ruleGroups()}>
              {(group) => (
                <AppDropdownMenuItem
                  class={cn(activeGroupName() === group && 'bg-accent/50')}
                  onSelect={() => setGroupFilter({ kind: 'group', name: group })}
                >
                  {group} ({groupCounts().byGroup.get(group) ?? 0})
                </AppDropdownMenuItem>
              )}
            </For>
          </PageToolbarTitleDropdown>
        }
        leading={
          props.onBack ? <ReplaceRulesToolbarLeading onBack={props.onBack} /> : undefined
        }
      >
        <ReplaceRulesPageToolbar
          searchQuery={searchQuery()}
          onSearchQueryChange={setSearchQuery}
          onNewRule={openNew}
          onImportLocal={importLocalJson}
          onImportNetwork={() => setImportUrlOpen(true)}
          onImportQR={() => setQrImportOpen(true)}
          onImportCode={() => setCodeImportOpen(true)}
        />
      </PageToolbar>

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background/40">
        <Show when={loading()}>
          <p class="px-4 py-8 text-center text-sm text-muted-foreground">加载中…</p>
        </Show>
        <Show when={!loading() && filtering() && filterProgressText()}>
          <p class="px-4 py-2 text-center text-xs text-muted-foreground">{filterProgressText()}</p>
        </Show>
        <Show when={!loading() && !filtering() && filteredRules().length === 0}>
          <p class="px-4 py-8 text-center text-sm text-muted-foreground">
            {searchQuery().trim() || groupFilter().kind !== 'all'
              ? '没有匹配的规则'
              : '暂无替换规则，可通过右上角「更多」新建或导入'}
          </p>
        </Show>
        <Show when={!loading() && filteredRules().length > 0}>
          <VirtualRuleManageList
            class="h-full min-h-0 flex-1"
            items={filteredRules}
            getItemKey={(rule) => rule.id}
            sortable={listSortable()}
          >
            {(rule) => (
              <ReplaceRuleListItem
                rule={rule}
                selected={selectedIds().has(rule.id)}
                onToggleSelection={() => toggleSelection(rule.id)}
                onSelectionChange={(checked) => {
                  const next = new Set(selectedIds());
                  if (checked) next.add(rule.id);
                  else next.delete(rule.id);
                  setSelectedIds(next);
                }}
                onEnableChange={async (enabled) => {
                  await replaceDb.updateReplaceRule({ ...rule, isEnabled: enabled });
                  invalidateReplaceRulesCache();
                  await reload();
                }}
                onEdit={() => openEdit(rule)}
                onMoveTop={async () => {
                  await replaceDb.moveReplaceRulesToTop([rule]);
                  invalidateReplaceRulesCache();
                  await reload();
                }}
                onMoveBottom={async () => {
                  await replaceDb.moveReplaceRulesToBottom([rule]);
                  invalidateReplaceRulesCache();
                  await reload();
                }}
                onDelete={async () => {
                  await replaceDb.deleteReplaceRule(rule.id);
                  invalidateReplaceRulesCache();
                  const next = new Set(selectedIds());
                  next.delete(rule.id);
                  setSelectedIds(next);
                  await reload();
                }}
              />
            )}
          </VirtualRuleManageList>
        </Show>
      </div>

      <div class="shrink-0 border-t border-border/50 bg-card px-2 py-2 sm:px-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              disabled={filteredRules().length === 0}
            >
              {allFilteredSelected() ? '取消全选' : '全选'}({filteredSelectedCount()}/
              {filteredRules().length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={invertSelection}
              disabled={filteredRules().length === 0}
            >
              反选
            </Button>
          </div>

          <div class="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedCount() === 0}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              删除
            </Button>
            <AppDropdownMenu>
              <AppDropdownMenuTrigger
                as={(p: Record<string, unknown>) => (
                  <AppDropdownMenuButtonTrigger
                    triggerProps={p}
                    variant="outline"
                    size="sm"
                    class={BATCH_MENU_TRIGGER_CLASS}
                  >
                    更多
                    <ChevronDownIcon class={BATCH_MENU_CHEVRON_CLASS} />
                  </AppDropdownMenuButtonTrigger>
                )}
              />
              <AppDropdownMenuContent layout="compact" align="end">
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => void batchEnable(true)}>启用所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => void batchEnable(false)}>禁用所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => void batchPinTop()}>置顶所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => void batchPinBottom()}>置底所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={batchExport}>导出所选</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => void enableAll(true)}>全部启用</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => void enableAll(false)}>全部禁用</AppDropdownMenuItem>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>
        </div>
      </div>

      <ReplaceRuleEditDialog
        open={editOpen()}
        onOpenChange={setEditOpen}
        rule={editingRule()}
        onSave={saveRule}
      />

      <AppDialog open={deleteConfirmOpen()} onOpenChange={setDeleteConfirmOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>删除所选规则？</AppDialogTitle>
            <AppDialogDescription>
              将删除 {selectedCount()} 条替换规则，此操作不可撤销。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter class="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void batchDelete()}>
              删除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <ImportSourceQrDialog
        open={qrImportOpen()}
        onOpenChange={setQrImportOpen}
        autoImport
        title="二维码导入替换规则"
        description="使用摄像头扫码或选择图片识别替换规则二维码。"
        onIdentify={(raw) => void handleRawTextIdentify(raw, 'qr', () => setQrImportOpen(false))}
      />

      <ImportCodeDialog
        open={codeImportOpen()}
        onOpenChange={setCodeImportOpen}
        title="代码导入替换规则"
        description="粘贴替换规则 JSON 数组或对象，也支持 legado:// / yuedu:// 深链接与 http(s) 地址。"
        confirmLabel="导入"
        onIdentify={(raw) => void handleRawTextIdentify(raw, 'code', () => setCodeImportOpen(false))}
      />

      <AppDialog open={importUrlOpen()} onOpenChange={setImportUrlOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>网络导入</AppDialogTitle>
            <AppDialogDescription>输入替换规则 JSON 文件的 URL</AppDialogDescription>
          </AppDialogHeader>
          <AppTextField class="px-6">
            <div class="relative">
              <LinkIcon class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <AppTextFieldInput
                class="pl-8"
                placeholder="https://..."
                value={importUrl()}
                onInput={(e) => setImportUrl(e.currentTarget.value)}
              />
            </div>
          </AppTextField>
          <AppDialogFooter class="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setImportUrlOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void importFromUrl()}>导入</Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <ImportReplaceRuleSelectDialog
        open={importSelectOpen()}
        loading={importLoading()}
        comparisons={importComparisons()}
        selectedKeys={importSelectedKeys()}
        keepGroup={importKeepGroup()}
        keepEnable={importKeepEnable()}
        groupName={importGroupName()}
        groupOptions={importGroupOptions()}
        adjustGroup={importAdjustGroup()}
        onKeepGroupChange={setImportKeepGroup}
        onKeepEnableChange={setImportKeepEnable}
        onGroupNameChange={setImportGroupName}
        onAdjustGroupChange={setImportAdjustGroup}
        onOpenChange={setImportSelectOpen}
        onToggle={(key, checked) => {
          const next = new Set(importSelectedKeys());
          if (checked) next.add(key);
          else next.delete(key);
          setImportSelectedKeys(next);
        }}
        onSelectAllToggle={() => {
          const all = importComparisons();
          if (importSelectedKeys().size === all.length) {
            setImportSelectedKeys(new Set<string>());
            return;
          }
          setImportSelectedKeys(new Set(all.map((c) => c.key)));
        }}
        onInvertSelect={() => {
          const next = new Set(importSelectedKeys());
          for (const c of importComparisons()) {
            if (next.has(c.key)) next.delete(c.key);
            else next.add(c.key);
          }
          setImportSelectedKeys(next);
        }}
        onSelectNewToggle={() => {
          setImportSelectedKeys(
            new Set(importComparisons().filter((c) => c.isNew).map((c) => c.key)),
          );
        }}
        onSelectUpdateToggle={() => {
          setImportSelectedKeys(
            new Set(importComparisons().filter((c) => c.isUpdate).map((c) => c.key)),
          );
        }}
        onConfirm={() => void confirmImportSelect()}
      />
    </div>
  );
}

/**
 * 字典规则管理（对齐 Legado DictRuleActivity + TXT 目录规则页交互）
 */

import { createSignal, Show } from 'solid-js';
import { useChunkedFilter } from '@/lib/hooks/useChunkedFilter';
import * as dictDb from '@/lib/database/dict-rules';
import { importDictRulesFromJson } from '@/lib/book-source/import-dict-rule';
import { importDictRulesFromNetworkUrl } from '@/lib/book-source/import-network-sidecar';
import { dictRuleMatchesSearch } from '@/lib/dict-rules/filter-dict-rules';
import { DictRuleListItem } from '@/components/dict-rules/DictRuleListItem';
import { DictRuleEditDialog } from '@/components/dict-rules/DictRuleEditDialog';
import {
  DictRulesPageToolbar,
  DictRulesToolbarLeading,
} from '@/components/dict-rules/DictRulesPageToolbar';
import { ImportSourceQrDialog } from '@/components/sources/ImportSourceQrDialog';
import { ImportCodeDialog } from '@/components/shared/ImportCodeDialog';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { parseReaderImportDeepLink } from '@/lib/platform/legado-import-uri';
import { VirtualRuleManageList } from '@/components/replace-rules/VirtualRuleManageList';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';
import type { DictRule } from '@/types';
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

const BATCH_MENU_TRIGGER_CLASS = 'gap-1.5 group/trigger';
const BATCH_MENU_CHEVRON_CLASS =
  'h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-data-expanded/trigger:rotate-180';

function emptyRule(): DictRule {
  return {
    name: '新词典',
    urlRule: '',
    showRule: '',
    enabled: true,
    sortNumber: 0,
  };
}

export interface DictRulesPageProps {
  onBack?: () => void;
}

export function DictRulesPage(props: DictRulesPageProps) {
  const [rules, setRules] = createSignal<DictRule[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedNames, setSelectedNames] = createSignal<Set<string>>(new Set());
  const [editOpen, setEditOpen] = createSignal(false);
  const [editingRule, setEditingRule] = createSignal<DictRule | null>(null);
  const [originalName, setOriginalName] = createSignal('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = createSignal(false);
  const [importUrlOpen, setImportUrlOpen] = createSignal(false);
  const [importUrl, setImportUrl] = createSignal('');
  const [qrImportOpen, setQrImportOpen] = createSignal(false);
  const [codeImportOpen, setCodeImportOpen] = createSignal(false);

  const { filtered: filteredRules, filtering, progressText: filterProgressText } = useChunkedFilter({
    items: rules,
    deps: searchQuery,
    isPassThrough: () => !searchQuery().trim(),
    match: (rule) => dictRuleMatchesSearch(rule, searchQuery()),
    progressLabel: '正在筛选规则',
  });
  const selectedCount = () => selectedNames().size;
  const filteredSelectedCount = () =>
    filteredRules().filter((r) => selectedNames().has(r.name)).length;
  const allFilteredSelected = () =>
    filteredRules().length > 0 && filteredSelectedCount() === filteredRules().length;

  const reload = async () => {
    setLoading(true);
    try {
      setRules(await dictDb.getAllDictRules());
    } finally {
      setLoading(false);
    }
  };

  const clearSelection = () => setSelectedNames(new Set<string>());

  const toggleSelection = (name: string) => {
    const next = new Set(selectedNames());
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelectedNames(next);
  };

  const selectedRules = () => rules().filter((r) => selectedNames().has(r.name));

  const openNew = () => {
    setEditingRule(emptyRule());
    setOriginalName('');
    setEditOpen(true);
  };

  const openEdit = (rule: DictRule) => {
    setEditingRule({ ...rule });
    setOriginalName(rule.name);
    setEditOpen(true);
  };

  const saveRule = async (rule: DictRule, prevName?: string) => {
    const all = rules();
    const sortNumber =
      rule.sortNumber ||
      (all.length > 0 ? Math.max(...all.map((r) => r.sortNumber)) + 1 : 0);
    if (prevName && prevName !== rule.name) {
      await dictDb.deleteDictRule(prevName);
    }
    await dictDb.upsertDictRule({ ...rule, sortNumber });
    await reload();
    showAppToast({ title: '已保存' });
  };

  const finishImport = async (count: number) => {
    await reload();
    showAppToast({
      title: count > 0 ? `已导入 ${count} 条规则` : '未识别到有效规则',
      variant: count > 0 ? 'default' : 'destructive',
    });
    return count > 0;
  };

  const importLocalJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const count = await importDictRulesFromJson(await file.text());
      await finishImport(count);
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
      const count = await importDictRulesFromNetworkUrl(trimmed);
      return finishImport(count);
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
    if (parsed?.kind === 'dictRuleNetwork') {
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

    const directCount = await importDictRulesFromJson(trimmed);
    if (await finishImport(directCount)) {
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
      description: '请使用字典规则 JSON 或规则链接',
      variant: 'destructive',
    });
  };

  const pageDescription = () => {
    const total = rules().length;
    const filtered = filteredRules().length;
    if (searchQuery().trim()) {
      return `共 ${total} 条 · 筛选 ${filtered} 条`;
    }
    return `共 ${total} 条规则`;
  };

  const importDefault = async () => {
    const count = await dictDb.importDefaultDictRules();
    await reload();
    showAppToast({ title: `已导入默认规则（${count} 条）` });
  };

  const batchEnable = async (enabled: boolean) => {
    const names = selectedRules().map((r) => r.name);
    if (names.length === 0) return;
    await dictDb.setDictRulesEnabled(names, enabled);
    await reload();
    clearSelection();
    showAppToast({ title: enabled ? '已启用所选' : '已禁用所选' });
  };

  const batchDelete = async () => {
    const names = selectedRules().map((r) => r.name);
    if (names.length === 0) return;
    await dictDb.deleteDictRules(names);
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
    a.download = `dictRule_${selected.length}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showAppToast({ title: `已导出 ${selected.length} 条规则` });
  };

  const batchPinTop = async () => {
    const selected = selectedRules();
    if (selected.length === 0) return;
    await dictDb.moveDictRulesToTop(selected);
    await reload();
    clearSelection();
    showAppToast({ title: '已置顶所选' });
  };

  const batchPinBottom = async () => {
    const selected = selectedRules();
    if (selected.length === 0) return;
    await dictDb.moveDictRulesToBottom(selected);
    await reload();
    clearSelection();
    showAppToast({ title: '已置底所选' });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected()) {
      const next = new Set(selectedNames());
      for (const r of filteredRules()) next.delete(r.name);
      setSelectedNames(next);
      return;
    }
    const next = new Set(selectedNames());
    for (const r of filteredRules()) next.add(r.name);
    setSelectedNames(next);
  };

  const invertSelection = () => {
    const next = new Set(selectedNames());
    for (const r of filteredRules()) {
      if (next.has(r.name)) next.delete(r.name);
      else next.add(r.name);
    }
    setSelectedNames(next);
  };

  void reload();

  return (
    <div class={mainShellPageRoot}>
      <PageToolbar
        class="border-b border-border/50 px-3 py-2 sm:px-4"
        title="字典规则"
        description={pageDescription()}
        titleSlot={
          <PageToolbarTitleDropdown
            title="字典规则"
            description={pageDescription()}
            dropdownEnabled={false}
          />
        }
        leading={
          props.onBack ? <DictRulesToolbarLeading onBack={props.onBack} /> : undefined
        }
      >
        <DictRulesPageToolbar
          searchQuery={searchQuery()}
          onSearchQueryChange={setSearchQuery}
          onNewRule={openNew}
          onImportLocal={importLocalJson}
          onImportNetwork={() => setImportUrlOpen(true)}
          onImportQR={() => setQrImportOpen(true)}
          onImportCode={() => setCodeImportOpen(true)}
          onImportDefault={() => void importDefault()}
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
            {searchQuery().trim() ? '没有匹配的规则' : '暂无字典规则，可通过右上角「更多」新建或导入'}
          </p>
        </Show>
        <Show when={!loading() && filteredRules().length > 0}>
          <VirtualRuleManageList
            class="h-full min-h-0 flex-1"
            items={filteredRules}
            getItemKey={(rule) => rule.name}
          >
            {(rule) => (
              <DictRuleListItem
                rule={rule}
                selected={selectedNames().has(rule.name)}
                onToggleSelection={() => toggleSelection(rule.name)}
                onSelectionChange={(checked) => {
                  const next = new Set(selectedNames());
                  if (checked) next.add(rule.name);
                  else next.delete(rule.name);
                  setSelectedNames(next);
                }}
                onEnableChange={async (enabled) => {
                  await dictDb.upsertDictRule({ ...rule, enabled });
                  await reload();
                }}
                onEdit={() => openEdit(rule)}
                onMoveTop={async () => {
                  await dictDb.moveDictRulesToTop([rule]);
                  await reload();
                }}
                onMoveBottom={async () => {
                  await dictDb.moveDictRulesToBottom([rule]);
                  await reload();
                }}
                onDelete={async () => {
                  await dictDb.deleteDictRule(rule.name);
                  const next = new Set(selectedNames());
                  next.delete(rule.name);
                  setSelectedNames(next);
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
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>
        </div>
      </div>

      <DictRuleEditDialog
        open={editOpen()}
        onOpenChange={setEditOpen}
        rule={editingRule()}
        originalName={originalName()}
        onSave={saveRule}
      />

      <AppDialog open={deleteConfirmOpen()} onOpenChange={setDeleteConfirmOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>删除所选规则？</AppDialogTitle>
            <AppDialogDescription>
              将删除 {selectedCount()} 条字典规则，此操作不可撤销。
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
        title="二维码导入字典规则"
        description="使用摄像头扫码或选择图片识别字典规则二维码。"
        onIdentify={(raw) => void handleRawTextIdentify(raw, 'qr', () => setQrImportOpen(false))}
      />

      <ImportCodeDialog
        open={codeImportOpen()}
        onOpenChange={setCodeImportOpen}
        title="代码导入字典规则"
        description="粘贴字典规则 JSON 数组或对象，也支持 legado:// / yuedu:// 深链接与 http(s) 地址。"
        confirmLabel="导入"
        onIdentify={(raw) => void handleRawTextIdentify(raw, 'code', () => setCodeImportOpen(false))}
      />

      <AppDialog open={importUrlOpen()} onOpenChange={setImportUrlOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>网络导入</AppDialogTitle>
            <AppDialogDescription>输入字典规则 JSON 文件的 URL</AppDialogDescription>
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
    </div>
  );
}

/**
 * TXT 目录规则管理（对齐 Legado TxtTocRuleActivity + 书源管理页交互）
 */

import { createSignal, Show } from 'solid-js';
import { useChunkedFilter } from '@/lib/hooks/useChunkedFilter';
import * as txtTocDb from '@/lib/database/txt-toc-rules';
import { importTxtTocRulesFromJson } from '@/lib/book-source/import-txt-toc-rule';
import { batchReparseLocalTxtBooks, listLocalTxtBooks } from '@/lib/local-book/batch-reparse-local-txt';
import { txtTocRuleMatchesSearch } from '@/lib/txt-toc-rules/filter-txt-toc-rules';
import { TxtTocRuleListItem } from '@/components/txt-toc-rules/TxtTocRuleListItem';
import { TxtTocRuleEditDialog } from '@/components/txt-toc-rules/TxtTocRuleEditDialog';
import {
  TxtTocRulesPageToolbar,
  TxtTocRulesToolbarLeading,
} from '@/components/txt-toc-rules/TxtTocRulesPageToolbar';
import { ImportSourceQrDialog } from '@/components/sources/ImportSourceQrDialog';
import { ImportCodeDialog } from '@/components/shared/ImportCodeDialog';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { parseReaderImportDeepLink } from '@/lib/platform/legado-import-uri';
import { VirtualRuleManageList } from '@/components/replace-rules/VirtualRuleManageList';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';
import type { TxtTocRule } from '@/types';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
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

function emptyRule(): TxtTocRule {
  return {
    id: 0,
    name: '新规则',
    rule: '',
    replacement: '',
    example: '',
    serialNumber: 0,
    enable: true,
  };
}

export interface TxtTocRulesPageProps {
  onBack?: () => void;
}

export function TxtTocRulesPage(props: TxtTocRulesPageProps) {
  const [rules, setRules] = createSignal<TxtTocRule[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  const [editOpen, setEditOpen] = createSignal(false);
  const [editingRule, setEditingRule] = createSignal<TxtTocRule | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = createSignal(false);
  const [importUrlOpen, setImportUrlOpen] = createSignal(false);
  const [importUrl, setImportUrl] = createSignal('');
  const [qrImportOpen, setQrImportOpen] = createSignal(false);
  const [codeImportOpen, setCodeImportOpen] = createSignal(false);
  const [batchReparseOpen, setBatchReparseOpen] = createSignal(false);
  const [batchReparseOnlyModified, setBatchReparseOnlyModified] = createSignal(false);
  const [batchReparseRunning, setBatchReparseRunning] = createSignal(false);
  const [batchReparseProgress, setBatchReparseProgress] = createSignal('');
  const [localTxtBookCount, setLocalTxtBookCount] = createSignal(0);

  const { filtered: filteredRules, filtering, progressText: filterProgressText } = useChunkedFilter({
    items: rules,
    deps: searchQuery,
    isPassThrough: () => !searchQuery().trim(),
    match: (rule) => txtTocRuleMatchesSearch(rule, searchQuery()),
    progressLabel: '正在筛选规则',
  });
  const selectedCount = () => selectedIds().size;
  const filteredSelectedCount = () =>
    filteredRules().filter((r) => selectedIds().has(r.id)).length;
  const allFilteredSelected = () =>
    filteredRules().length > 0 && filteredSelectedCount() === filteredRules().length;

  const reload = async () => {
    setLoading(true);
    try {
      setRules(await txtTocDb.getAllTxtTocRules());
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

  const openEdit = (rule: TxtTocRule) => {
    setEditingRule({ ...rule });
    setEditOpen(true);
  };

  const saveRule = async (rule: TxtTocRule) => {
    const id = rule.id !== 0 ? rule.id : await txtTocDb.allocateTxtTocRuleId();
    const all = rules();
    const serialNumber =
      rule.serialNumber ||
      (all.length > 0 ? Math.max(...all.map((r) => r.serialNumber)) + 1 : 0);
    await txtTocDb.upsertTxtTocRule({ ...rule, id, serialNumber });
    await reload();
    showAppToast({ title: '已保存' });
  };

  const importLocalJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const count = await importTxtTocRulesFromJson(await file.text());
      await reload();
      showAppToast({
        title: count > 0 ? `已导入 ${count} 条规则` : '未识别到有效规则',
        variant: count > 0 ? 'default' : 'destructive',
      });
    };
    input.click();
  };

  const importFromNetworkUrl = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) {
      showAppToast({ title: '请输入规则 URL', variant: 'destructive' });
      return;
    }
    try {
      const res = await fetch(trimmed);
      const text = await res.text();
      const count = await importTxtTocRulesFromJson(text);
      await reload();
      showAppToast({
        title: count > 0 ? `已导入 ${count} 条规则` : '未识别到有效规则',
        variant: count > 0 ? 'default' : 'destructive',
      });
      return count > 0;
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
    if (parsed?.kind === 'txtTocRuleNetwork') {
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

    const directCount = await importTxtTocRulesFromJson(trimmed);
    if (directCount > 0) {
      await reload();
      close?.();
      showAppToast({ title: `已导入 ${directCount} 条规则` });
      return;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      const ok = await importFromNetworkUrl(trimmed);
      if (ok) close?.();
      return;
    }

    showAppToast({
      title: via === 'qr' ? '无法识别二维码内容' : '无法识别代码内容',
      description: '请使用 TXT 目录规则 JSON 或规则链接',
      variant: 'destructive',
    });
  };

  const handleQrIdentify = (raw: string) =>
    void handleRawTextIdentify(raw, 'qr', () => setQrImportOpen(false));

  const pageDescription = () => {
    const total = rules().length;
    const filtered = filteredRules().length;
    if (searchQuery().trim()) {
      return `共 ${total} 条 · 筛选 ${filtered} 条`;
    }
    return `共 ${total} 条规则`;
  };

  const importDefault = async () => {
    const count = await txtTocDb.importDefaultTxtTocRules();
    await reload();
    showAppToast({ title: `已导入默认规则（${count} 条）` });
  };

  const batchEnable = async (enabled: boolean) => {
    const ids = selectedRules().map((r) => r.id);
    if (ids.length === 0) return;
    await txtTocDb.setTxtTocRulesEnabled(ids, enabled);
    await reload();
    clearSelection();
    showAppToast({ title: enabled ? '已启用所选' : '已禁用所选' });
  };

  const batchDelete = async () => {
    const ids = selectedRules().map((r) => r.id);
    if (ids.length === 0) return;
    await txtTocDb.deleteTxtTocRules(ids);
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
    a.download = `txtTocRule_${selected.length}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showAppToast({ title: `已导出 ${selected.length} 条规则` });
  };

  const batchPinTop = async () => {
    const selected = selectedRules();
    if (selected.length === 0) return;
    await txtTocDb.moveTxtTocRulesToTop(selected);
    await reload();
    clearSelection();
    showAppToast({ title: '已置顶所选' });
  };

  const batchPinBottom = async () => {
    const selected = selectedRules();
    if (selected.length === 0) return;
    await txtTocDb.moveTxtTocRulesToBottom(selected);
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

  const openBatchReparse = async () => {
    setBatchReparseProgress('');
    setBatchReparseOnlyModified(false);
    try {
      const books = await listLocalTxtBooks();
      setLocalTxtBookCount(books.length);
    } catch {
      setLocalTxtBookCount(0);
    }
    setBatchReparseOpen(true);
  };

  const runBatchReparse = async (force: boolean) => {
    if (batchReparseRunning()) return;
    setBatchReparseRunning(true);
    setBatchReparseProgress('准备中…');
    try {
      const result = await batchReparseLocalTxtBooks({
        onlyModified: !force && batchReparseOnlyModified(),
        force,
        onProgress: (p) => {
          setBatchReparseProgress(
            `${p.done}/${p.total} ${p.bookName}${p.status === 'failed' ? '（失败）' : ''}`,
          );
        },
      });
      setBatchReparseOpen(false);
      showAppToast({
        title: '批量重解析完成',
        description: `成功 ${result.success}，失败 ${result.failed}，跳过 ${result.skipped}`,
      });
    } catch (e) {
      showAppToast({
        title: '批量重解析失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBatchReparseRunning(false);
      setBatchReparseProgress('');
    }
  };

  void reload();

  return (
    <div class={mainShellPageRoot}>
      <PageToolbar
        class="border-b border-border/50 px-3 py-2 sm:px-4"
        title="TXT 目录规则"
        description={pageDescription()}
        titleSlot={
          <PageToolbarTitleDropdown
            title="TXT 目录规则"
            description={pageDescription()}
            dropdownEnabled={false}
          />
        }
        leading={
          props.onBack ? <TxtTocRulesToolbarLeading onBack={props.onBack} /> : undefined
        }
      >
        <TxtTocRulesPageToolbar
          searchQuery={searchQuery()}
          onSearchQueryChange={setSearchQuery}
          onNewRule={openNew}
          onImportLocal={importLocalJson}
          onImportNetwork={() => setImportUrlOpen(true)}
          onImportQR={() => setQrImportOpen(true)}
          onImportCode={() => setCodeImportOpen(true)}
          onImportDefault={() => void importDefault()}
          onBatchReparse={() => void openBatchReparse()}
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
            {searchQuery().trim() ? '没有匹配的规则' : '暂无目录规则，可通过右上角「更多」新建或导入'}
          </p>
        </Show>
        <Show when={!loading() && filteredRules().length > 0}>
          <VirtualRuleManageList
            class="h-full min-h-0 flex-1"
            items={filteredRules}
            getItemKey={(rule) => rule.id}
          >
            {(rule) => (
              <TxtTocRuleListItem
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
                  await txtTocDb.upsertTxtTocRule({ ...rule, enable: enabled });
                  await reload();
                }}
                onEdit={() => openEdit(rule)}
                onMoveTop={async () => {
                  await txtTocDb.moveTxtTocRulesToTop([rule]);
                  await reload();
                }}
                onMoveBottom={async () => {
                  await txtTocDb.moveTxtTocRulesToBottom([rule]);
                  await reload();
                }}
                onDelete={async () => {
                  await txtTocDb.deleteTxtTocRule(rule.id);
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
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>
        </div>
      </div>

      <TxtTocRuleEditDialog
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
              将删除 {selectedCount()} 条 TXT 目录规则，此操作不可撤销。
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
        title="二维码导入 TXT 目录规则"
        description="使用摄像头扫码或选择图片识别 TXT 目录规则二维码。"
        onIdentify={(raw) => void handleQrIdentify(raw)}
      />

      <ImportCodeDialog
        open={codeImportOpen()}
        onOpenChange={setCodeImportOpen}
        title="代码导入 TXT 目录规则"
        description="粘贴 TXT 目录规则 JSON 数组或对象，也支持 legado:// / yuedu:// 深链接与 http(s) 地址。"
        confirmLabel="导入"
        onIdentify={(raw) => void handleRawTextIdentify(raw, 'code', () => setCodeImportOpen(false))}
      />

      <AppDialog open={batchReparseOpen()} onOpenChange={setBatchReparseOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>批量重解析书架</AppDialogTitle>
            <AppDialogDescription>
              对书架中 {localTxtBookCount()} 本本地 TXT 按当前目录规则重新分章。文件在外部被修改过的书会在打开时自动重解析；此处可手动全量或按变更批量刷新。
            </AppDialogDescription>
          </AppDialogHeader>
          <div class="space-y-3 px-6 text-sm">
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={batchReparseOnlyModified()}
                disabled={batchReparseRunning()}
                onChange={(e) => setBatchReparseOnlyModified(e.currentTarget.checked)}
              />
              <span>仅重解析检测到文件变更的书（mtime / 大小）</span>
            </label>
            <Show when={batchReparseProgress()}>
              <p class="text-muted-foreground">{batchReparseProgress()}</p>
            </Show>
          </div>
          <AppDialogFooter class="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={batchReparseRunning()}
              onClick={() => setBatchReparseOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="outline"
              disabled={batchReparseRunning() || localTxtBookCount() === 0}
              onClick={() => void runBatchReparse(false)}
            >
              {batchReparseRunning() ? '处理中…' : '开始'}
            </Button>
            <Button
              disabled={batchReparseRunning() || localTxtBookCount() === 0}
              onClick={() => void runBatchReparse(true)}
            >
              强制全部
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={importUrlOpen()} onOpenChange={setImportUrlOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>网络导入</AppDialogTitle>
            <AppDialogDescription>输入 TXT 目录规则 JSON 文件的 URL</AppDialogDescription>
          </AppDialogHeader>
          <TextField class="px-6">
            <div class="relative">
              <LinkIcon class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <TextFieldInput
                class="pl-8"
                placeholder="https://..."
                value={importUrl()}
                onInput={(e) => setImportUrl(e.currentTarget.value)}
              />
            </div>
          </TextField>
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

/**
 * 替换净化规则管理（对齐 Legado ReplaceRuleActivity + TXT 目录规则页交互）
 */

import { createMemo, createSignal, For, Show } from 'solid-js';
import * as replaceDb from '@/lib/database/replace-rules';
import { invalidateReplaceRulesCache } from '@/lib/book-source/content-processor';
import { importReplaceRulesFromJson } from '@/lib/book-source/import-replace-rule';
import { importReplaceRulesFromNetworkUrl } from '@/lib/book-source/import-network-sidecar';
import { filterReplaceRules } from '@/lib/replace-rules/filter-replace-rules';
import { ReplaceRuleListItem } from '@/components/replace-rules/ReplaceRuleListItem';
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
import {
  settingsRuleManagePageListScroll,
  settingsRuleManagePageRoot,
} from '@/lib/ui/viewport-classes';
import type { ReplaceRule } from '@/types';
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
  const [loading, setLoading] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  const [editOpen, setEditOpen] = createSignal(false);
  const [editingRule, setEditingRule] = createSignal<ReplaceRuleDraft | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = createSignal(false);
  const [importUrlOpen, setImportUrlOpen] = createSignal(false);
  const [importUrl, setImportUrl] = createSignal('');
  const [qrImportOpen, setQrImportOpen] = createSignal(false);
  const [codeImportOpen, setCodeImportOpen] = createSignal(false);

  const filteredRules = createMemo(() => filterReplaceRules(rules(), searchQuery()));
  const selectedCount = () => selectedIds().size;
  const filteredSelectedCount = () =>
    filteredRules().filter((r) => selectedIds().has(r.id)).length;
  const allFilteredSelected = () =>
    filteredRules().length > 0 && filteredSelectedCount() === filteredRules().length;

  const reload = async () => {
    setLoading(true);
    try {
      setRules(await replaceDb.getAllReplaceRules());
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

  const importLocalJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const count = await importReplaceRulesFromJson(await file.text());
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
      const count = await importReplaceRulesFromNetworkUrl(trimmed);
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

    const directCount = await importReplaceRulesFromJson(trimmed);
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
      description: '请使用替换规则 JSON 或规则链接',
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

  void reload();

  return (
    <div class={settingsRuleManagePageRoot}>
      <PageToolbar
        class="border-b border-border/50 px-3 py-2 sm:px-4"
        title="替换净化"
        description={pageDescription()}
        titleSlot={
          <PageToolbarTitleDropdown
            title="替换净化"
            description={pageDescription()}
            dropdownEnabled={false}
          />
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

      <div class={settingsRuleManagePageListScroll}>
        <Show when={loading()}>
          <p class="px-4 py-8 text-center text-sm text-muted-foreground">加载中…</p>
        </Show>
        <Show when={!loading() && filteredRules().length === 0}>
          <p class="px-4 py-8 text-center text-sm text-muted-foreground">
            {searchQuery().trim() ? '没有匹配的规则' : '暂无替换规则，可通过右上角「更多」新建或导入'}
          </p>
        </Show>
        <Show when={!loading() && filteredRules().length > 0}>
          <ul>
            <For each={filteredRules()}>
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
            </For>
          </ul>
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

/**
 * 替换规则管理（对齐 Legado 替换规则页）
 */

import { createSignal, For, Show } from 'solid-js';
import * as replaceDb from '@/lib/database/replace-rules';
import { invalidateReplaceRulesCache } from '@/lib/book-source/content-processor';
import { importReplaceRulesFromJson } from '@/lib/book-source/import-replace-rule';
import { importReplaceRulesFromNetworkUrl } from '@/lib/book-source/import-network-sidecar';
import { parseReaderImportDeepLink } from '@/lib/platform/legado-import-uri';
import type { ReplaceRule } from '@/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import { TextField, TextFieldInput, TextFieldTextArea } from '@/components/ui/text-field';
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
import { ImportSourceQrDialog } from '@/components/sources/ImportSourceQrDialog';
import { ImportCodeDialog } from '@/components/shared/ImportCodeDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  ChevronDownIcon,
  CodeIcon,
  FolderPlusIcon,
  ImportIcon,
  LinkIcon,
  ScanQrCodeIcon,
} from '@/components/shared/icons';

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

export function ReplaceRulesPage() {
  const [rules, setRules] = createSignal<ReplaceRule[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [editOpen, setEditOpen] = createSignal(false);
  const [draft, setDraft] = createSignal<ReplaceRule | Omit<ReplaceRule, 'id'>>(emptyRule());
  const [importUrlOpen, setImportUrlOpen] = createSignal(false);
  const [importUrl, setImportUrl] = createSignal('');
  const [qrImportOpen, setQrImportOpen] = createSignal(false);
  const [codeImportOpen, setCodeImportOpen] = createSignal(false);

  const reload = async () => {
    setLoading(true);
    try {
      setRules(await replaceDb.getAllReplaceRules());
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setDraft(emptyRule());
    setEditOpen(true);
  };

  const openEdit = (rule: ReplaceRule) => {
    setDraft({ ...rule });
    setEditOpen(true);
  };

  const saveDraft = async () => {
    const d = draft();
    if (!d.pattern.trim()) {
      showAppToast({ title: '请填写匹配内容', variant: 'destructive' });
      return;
    }
    if ('id' in d && d.id) {
      await replaceDb.updateReplaceRule(d as ReplaceRule);
    } else {
      await replaceDb.insertReplaceRule({ ...(d as Omit<ReplaceRule, 'id'>), id: 0 });
    }
    invalidateReplaceRulesCache();
    setEditOpen(false);
    await reload();
    showAppToast({ title: '已保存' });
  };

  const remove = async (id: number) => {
    await replaceDb.deleteReplaceRule(id);
    invalidateReplaceRulesCache();
    await reload();
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

  void reload();

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap gap-2">
        <Button onClick={openNew}>新建规则</Button>
        <Button
          variant="outline"
          onClick={async () => {
            await replaceDb.enableAllReplaceRules(true);
            invalidateReplaceRulesCache();
            await reload();
          }}
        >
          全部启用
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            await replaceDb.enableAllReplaceRules(false);
            invalidateReplaceRulesCache();
            await reload();
          }}
        >
          全部禁用
        </Button>
        <AppDropdownMenu>
          <AppDropdownMenuTrigger
            as={(triggerProps: Record<string, unknown>) => (
              <AppDropdownMenuButtonTrigger triggerProps={triggerProps} variant="outline">
                <ImportIcon class="h-4 w-4" />
                <span>导入</span>
                <ChevronDownIcon class="h-4 w-4 opacity-50" />
              </AppDropdownMenuButtonTrigger>
            )}
          />
          <AppDropdownMenuContent layout="compact">
            <AppDropdownMenuItem onSelect={() => importLocalJson()}>
              <FolderPlusIcon class="h-4 w-4" />
              <span>本地导入</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => setImportUrlOpen(true)}>
              <LinkIcon class="h-4 w-4" />
              <span>网络导入</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => setQrImportOpen(true)}>
              <ScanQrCodeIcon class="h-4 w-4" />
              <span>二维码导入</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => setCodeImportOpen(true)}>
              <CodeIcon class="h-4 w-4" />
              <span>代码导入</span>
            </AppDropdownMenuItem>
          </AppDropdownMenuContent>
        </AppDropdownMenu>
      </div>

      <Show when={loading()}>
        <p class="text-sm text-muted-foreground">加载中…</p>
      </Show>

      <ul class="space-y-2">
        <For each={rules()}>
          {(rule) => (
            <li class="rounded-xl border border-border/50 bg-card p-4">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="font-medium">{rule.name}</div>
                  <div class="mt-1 font-mono text-xs text-muted-foreground break-all">
                    {rule.pattern}
                  </div>
                  <div class="mt-1 text-xs text-muted-foreground">
                    {rule.isEnabled ? '已启用' : '已禁用'}
                    {rule.group ? ` · ${rule.group}` : ''}
                  </div>
                </div>
                <Switch
                  checked={rule.isEnabled}
                  onChange={async (v) => {
                    await replaceDb.updateReplaceRule({ ...rule, isEnabled: !!v });
                    invalidateReplaceRulesCache();
                    await reload();
                  }}
                >
                  <SwitchControl>
                    <SwitchThumb />
                  </SwitchControl>
                  <SwitchLabel class="sr-only">启用</SwitchLabel>
                </Switch>
              </div>
              <div class="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(rule)}>
                  编辑
                </Button>
                <Button size="sm" variant="ghost" class="text-destructive" onClick={() => void remove(rule.id)}>
                  删除
                </Button>
              </div>
            </li>
          )}
        </For>
      </ul>

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
            <TextFieldInput
              placeholder="https://..."
              value={importUrl()}
              onInput={(e) => setImportUrl(e.currentTarget.value)}
            />
          </TextField>
          <AppDialogFooter class="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setImportUrlOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void importFromUrl()}>导入</Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={editOpen()} onOpenChange={setEditOpen}>
        <AppDialogContent class="max-w-lg">
          <AppDialogHeader>
            <AppDialogTitle>{'id' in draft() && (draft() as ReplaceRule).id ? '编辑规则' : '新建规则'}</AppDialogTitle>
          </AppDialogHeader>
          <div class="space-y-3 px-6 pb-6">
            <div>
              <Label>名称</Label>
              <TextField class="mt-1">
                <TextFieldInput
                  value={draft().name}
                  onInput={(e) => setDraft({ ...draft(), name: e.currentTarget.value })}
                />
              </TextField>
            </div>
            <div>
              <Label>匹配（正则或文本）</Label>
              <TextField class="mt-1">
                <TextFieldTextArea
                  value={draft().pattern}
                  onInput={(e) => setDraft({ ...draft(), pattern: e.currentTarget.value })}
                  rows={3}
                />
              </TextField>
            </div>
            <div>
              <Label>替换为</Label>
              <TextField class="mt-1">
                <TextFieldTextArea
                  value={draft().replacement}
                  onInput={(e) => setDraft({ ...draft(), replacement: e.currentTarget.value })}
                  rows={2}
                />
              </TextField>
            </div>
            <div class="flex gap-4">
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft().scopeContent}
                  onChange={(e) =>
                    setDraft({ ...draft(), scopeContent: e.currentTarget.checked })
                  }
                />
                作用于正文
              </label>
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft().scopeTitle}
                  onChange={(e) =>
                    setDraft({ ...draft(), scopeTitle: e.currentTarget.checked })
                  }
                />
                作用于标题
              </label>
            </div>
            <Button class="w-full" onClick={() => void saveDraft()}>
              保存
            </Button>
          </div>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}

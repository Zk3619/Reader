/**
 * 替换规则管理（对齐 Legado 替换规则页）
 */

import { createSignal, For, Show } from 'solid-js';
import * as replaceDb from '@/lib/database/replace-rules';
import { invalidateReplaceRulesCache } from '@/lib/book-source/content-processor';
import type { ReplaceRule } from '@/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import { TextField, TextFieldInput, TextFieldTextArea } from '@/components/ui/text-field';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';

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

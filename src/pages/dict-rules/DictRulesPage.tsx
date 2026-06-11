/**
 * 字典规则管理（对齐 Legado DictRuleActivity）
 */

import { createSignal, For, Show } from 'solid-js';
import * as dictDb from '@/lib/database/dict-rules';
import { importDictRulesFromJson } from '@/lib/book-source/import-dict-rule';
import type { DictRule } from '@/types';
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

function emptyRule(): DictRule {
  return {
    name: '新词典',
    urlRule: '',
    showRule: '',
    enabled: true,
    sortNumber: 0,
  };
}

export function DictRulesPage() {
  const [rules, setRules] = createSignal<DictRule[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [editOpen, setEditOpen] = createSignal(false);
  const [draft, setDraft] = createSignal<DictRule>(emptyRule());
  const [isNew, setIsNew] = createSignal(true);
  const [originalName, setOriginalName] = createSignal('');

  const reload = async () => {
    setLoading(true);
    try {
      setRules(await dictDb.getAllDictRules());
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setDraft(emptyRule());
    setIsNew(true);
    setOriginalName('');
    setEditOpen(true);
  };

  const openEdit = (rule: DictRule) => {
    setDraft({ ...rule });
    setIsNew(false);
    setOriginalName(rule.name);
    setEditOpen(true);
  };

  const saveDraft = async () => {
    const d = draft();
    if (!d.name.trim()) {
      showAppToast({ title: '请填写规则名称', variant: 'destructive' });
      return;
    }
    if (!isNew() && originalName() && originalName() !== d.name) {
      await dictDb.deleteDictRule(originalName());
    }
    await dictDb.upsertDictRule(d);
    setEditOpen(false);
    await reload();
    showAppToast({ title: '已保存' });
  };

  const remove = async (name: string) => {
    await dictDb.deleteDictRule(name);
    await reload();
  };

  const importJson = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const count = await importDictRulesFromJson(text);
      await reload();
      showAppToast({
        title: count > 0 ? `已导入 ${count} 条规则` : '未识别到有效规则',
        variant: count > 0 ? 'default' : 'destructive',
      });
    };
    input.click();
  };

  void reload();

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap gap-2">
        <Button onClick={openNew}>新建规则</Button>
        <Button variant="outline" onClick={() => void importJson()}>
          导入 JSON
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
                  <div class="mt-1 font-mono text-xs text-muted-foreground break-all line-clamp-2">
                    {rule.urlRule}
                  </div>
                  <div class="mt-1 text-xs text-muted-foreground">
                    {rule.enabled ? '已启用' : '已禁用'} · 排序 {rule.sortNumber}
                  </div>
                </div>
                <Switch
                  checked={rule.enabled}
                  onChange={async (v) => {
                    await dictDb.upsertDictRule({ ...rule, enabled: !!v });
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
                <Button
                  size="sm"
                  variant="ghost"
                  class="text-destructive"
                  onClick={() => void remove(rule.name)}
                >
                  删除
                </Button>
              </div>
            </li>
          )}
        </For>
      </ul>

      <AppDialog open={editOpen()} onOpenChange={setEditOpen}>
        <AppDialogContent class="max-w-lg max-h-[85dvh] overflow-y-auto">
          <AppDialogHeader>
            <AppDialogTitle>{isNew() ? '新建规则' : '编辑规则'}</AppDialogTitle>
          </AppDialogHeader>
          <div class="space-y-3 px-6 pb-6">
            <div>
              <Label>名称（主键）</Label>
              <TextField class="mt-1">
                <TextFieldInput
                  value={draft().name}
                  onInput={(e) => setDraft({ ...draft(), name: e.currentTarget.value })}
                />
              </TextField>
            </div>
            <div>
              <Label>请求 URL 规则</Label>
              <TextField class="mt-1">
                <TextFieldTextArea
                  value={draft().urlRule}
                  onInput={(e) => setDraft({ ...draft(), urlRule: e.currentTarget.value })}
                  rows={4}
                  class="font-mono text-xs"
                />
              </TextField>
            </div>
            <div>
              <Label>结果解析规则</Label>
              <TextField class="mt-1">
                <TextFieldTextArea
                  value={draft().showRule}
                  onInput={(e) => setDraft({ ...draft(), showRule: e.currentTarget.value })}
                  rows={4}
                  class="font-mono text-xs"
                />
              </TextField>
            </div>
            <div>
              <Label>排序</Label>
              <TextField class="mt-1">
                <TextFieldInput
                  type="number"
                  value={String(draft().sortNumber)}
                  onInput={(e) =>
                    setDraft({ ...draft(), sortNumber: Number(e.currentTarget.value) || 0 })
                  }
                />
              </TextField>
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

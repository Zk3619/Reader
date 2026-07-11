import { dialogScrollFrameFlex, appDialogScrollBodySpaceY3 } from '@/lib/ui/viewport-classes';
/**
 * 字典规则编辑（对齐 Legado DictRuleEditDialog）
 */

import { createSignal, createEffect } from 'solid-js';
import type { DictRule } from '@/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AppTextField, AppTextFieldInput, AppTextFieldTextArea } from '@/components/shared/AppTextField';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';

export interface DictRuleEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: DictRule | null;
  originalName?: string;
  onSave: (rule: DictRule, originalName?: string) => Promise<void>;
}

function validateRule(rule: DictRule): string | null {
  if (!rule.name.trim()) return '名称不能为空';
  if (!rule.urlRule.trim()) return '请填写请求 URL 规则';
  return null;
}

export function DictRuleEditDialog(props: DictRuleEditDialogProps) {
  const [draft, setDraft] = createSignal<DictRule | null>(null);

  createEffect(() => {
    if (props.open && props.rule) {
      setDraft({ ...props.rule });
    }
  });

  const copyRuleJson = async () => {
    const d = draft();
    if (!d) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(d, null, 2));
      showAppToast({ title: '已复制规则 JSON' });
    } catch {
      showAppToast({ title: '复制失败', variant: 'destructive' });
    }
  };

  const pasteRuleJson = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const data = JSON.parse(text) as Partial<DictRule>;
      const current = draft();
      if (!current) return;
      setDraft({
        ...current,
        name: String(data.name ?? current.name),
        urlRule: String(data.urlRule ?? current.urlRule),
        showRule: String(data.showRule ?? current.showRule),
        enabled: data.enabled ?? current.enabled,
        sortNumber: Number(data.sortNumber ?? current.sortNumber),
      });
      showAppToast({ title: '已粘贴规则' });
    } catch {
      showAppToast({ title: '剪贴板内容不是有效规则 JSON', variant: 'destructive' });
    }
  };

  const save = async () => {
    const d = draft();
    if (!d) return;
    const err = validateRule(d);
    if (err) {
      showAppToast({ title: err, variant: 'destructive' });
      return;
    }
    await props.onSave(d, props.originalName);
    props.onOpenChange(false);
  };

  const isEditing = () => Boolean(props.originalName);

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="flex max-w-lg flex-col overflow-hidden">
        <AppDialogHeader>
          <AppDialogTitle>{isEditing() ? '编辑字典规则' : '新建字典规则'}</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogScrollBodySpaceY3}>
          <div>
            <Label>名称（主键）</Label>
            <AppTextField class="mt-1">
              <AppTextFieldInput
                value={draft()?.name ?? ''}
                onInput={(e) =>
                  setDraft({ ...(draft() as DictRule), name: e.currentTarget.value })
                }
              />
            </AppTextField>
          </div>
          <div>
            <Label>请求 URL 规则</Label>
            <AppTextField class="mt-1">
              <AppTextFieldTextArea
                value={draft()?.urlRule ?? ''}
                onInput={(e) =>
                  setDraft({ ...(draft() as DictRule), urlRule: e.currentTarget.value })
                }
                rows={4}
                class="font-mono text-xs"
              />
            </AppTextField>
          </div>
          <div>
            <Label>结果解析规则</Label>
            <AppTextField class="mt-1">
              <AppTextFieldTextArea
                value={draft()?.showRule ?? ''}
                onInput={(e) =>
                  setDraft({ ...(draft() as DictRule), showRule: e.currentTarget.value })
                }
                rows={4}
                class="font-mono text-xs"
              />
            </AppTextField>
          </div>
          <div>
            <Label>排序</Label>
            <AppTextField class="mt-1">
              <AppTextFieldInput
                type="number"
                value={String(draft()?.sortNumber ?? 0)}
                onInput={(e) =>
                  setDraft({
                    ...(draft() as DictRule),
                    sortNumber: Number(e.currentTarget.value) || 0,
                  })
                }
              />
            </AppTextField>
          </div>
        </AppDialogScrollBody>
        <div class="flex flex-wrap gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" size="sm" onClick={() => void copyRuleJson()}>
            复制规则
          </Button>
          <Button variant="outline" size="sm" onClick={() => void pasteRuleJson()}>
            粘贴规则
          </Button>
          <div class="flex-1" />
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void save()}>保存</Button>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}

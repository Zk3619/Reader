import { dialogScrollFrameFlex, appDialogScrollBodySpaceY3 } from '@/lib/ui/viewport-classes';
/**
 * TXT 目录规则编辑（对齐 Legado TxtTocRuleEditDialog）
 */

import { createSignal, createEffect } from 'solid-js';
import type { TxtTocRule } from '@/types';
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

export interface TxtTocRuleEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: TxtTocRule | null;
  onSave: (rule: TxtTocRule) => Promise<void>;
}

function validateRule(rule: TxtTocRule): string | null {
  if (!rule.name.trim()) return '名称不能为空';
  if (rule.rule.trim()) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(rule.rule, 'gm');
    } catch (e) {
      return e instanceof Error ? `正则语法错误：${e.message}` : '正则语法错误';
    }
  }
  return null;
}

export function TxtTocRuleEditDialog(props: TxtTocRuleEditDialogProps) {
  const [draft, setDraft] = createSignal<TxtTocRule | null>(null);

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
      const data = JSON.parse(text) as Partial<TxtTocRule>;
      const current = draft();
      if (!current) return;
      setDraft({
        ...current,
        name: String(data.name ?? current.name),
        rule: String(data.rule ?? current.rule),
        replacement: String(data.replacement ?? current.replacement),
        example: data.example != null ? String(data.example) : current.example,
        enable: data.enable ?? current.enable,
        serialNumber: Number(data.serialNumber ?? current.serialNumber),
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
    await props.onSave(d);
    props.onOpenChange(false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="flex max-w-lg flex-col overflow-hidden">
        <AppDialogHeader>
          <AppDialogTitle>{props.rule?.id ? '编辑目录规则' : '新建目录规则'}</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogScrollBodySpaceY3}>
          <div>
            <Label>名称</Label>
            <AppTextField class="mt-1">
              <AppTextFieldInput
                value={draft()?.name ?? ''}
                onInput={(e) => setDraft({ ...(draft() as TxtTocRule), name: e.currentTarget.value })}
              />
            </AppTextField>
          </div>
          <div>
            <Label>正则（MULTILINE）</Label>
            <AppTextField class="mt-1">
              <AppTextFieldTextArea
                value={draft()?.rule ?? ''}
                onInput={(e) => setDraft({ ...(draft() as TxtTocRule), rule: e.currentTarget.value })}
                rows={5}
                class="font-mono text-xs"
              />
            </AppTextField>
          </div>
          <div>
            <Label>标题净化脚本（可选 JS）</Label>
            <p class="mt-1 text-xs text-muted-foreground">
              可用变量：result、index、prevTitle、prevLength、lastVolumeTitle、book；
              java.putVolume(title) 插入卷节点；返回空字符串则跳过该匹配。
            </p>
            <AppTextField class="mt-1">
              <AppTextFieldTextArea
                value={draft()?.replacement ?? ''}
                onInput={(e) =>
                  setDraft({ ...(draft() as TxtTocRule), replacement: e.currentTarget.value })
                }
                rows={4}
                class="font-mono text-xs"
              />
            </AppTextField>
          </div>
          <div>
            <Label>示例</Label>
            <AppTextField class="mt-1">
              <AppTextFieldInput
                value={draft()?.example ?? ''}
                onInput={(e) =>
                  setDraft({ ...(draft() as TxtTocRule), example: e.currentTarget.value })
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

import { dialogScrollFrameFlex, appDialogScrollBodySpaceY3 } from '@/lib/ui/viewport-classes';
/**
 * 替换净化规则编辑（对齐 Legado ReplaceEditActivity）
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { ReplaceRule } from '@/types';
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
import {
  ViewerAppDialog,
  ViewerAppStackedDialogContent,
} from '@/components/viewer/viewer-app-overlay';
import { showAppToast } from '@/components/shared/AppToasts';
import { isReplaceRuleValid } from '@/lib/replace-rules/replace-text';
import { testReplaceRule } from '@/lib/replace-rules/test-replace-rule';

export type ReplaceRuleDraft = ReplaceRule | Omit<ReplaceRule, 'id'>;

export type ReplaceRuleEditDialogOverlayLayer = 'app' | 'viewer-stacked';

export interface ReplaceRuleEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: ReplaceRuleDraft | null;
  onSave: (rule: ReplaceRuleDraft) => Promise<void>;
  /** @default 'app' */
  overlayLayer?: ReplaceRuleEditDialogOverlayLayer;
}

function validateRule(rule: ReplaceRuleDraft): string | null {
  if (!rule.name.trim()) return '名称不能为空';
  if (!rule.pattern.trim()) return '请填写匹配内容';
  if (!isReplaceRuleValid(rule)) {
    if (rule.isRegex && rule.pattern.endsWith('|') && !rule.pattern.endsWith('\\|')) {
      return '正则末尾不能为未转义的 |';
    }
    return '正则语法错误或不支持';
  }
  return null;
}

export function ReplaceRuleEditDialog(props: ReplaceRuleEditDialogProps) {
  const [draft, setDraft] = createSignal<ReplaceRuleDraft | null>(null);
  const [testSample, setTestSample] = createSignal('');
  const [testResult, setTestResult] = createSignal('');
  const [testing, setTesting] = createSignal(false);

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
      const data = JSON.parse(text) as Partial<ReplaceRule>;
      const current = draft();
      if (!current) return;
      setDraft({
        ...current,
        name: String(data.name ?? current.name),
        group: data.group != null ? String(data.group) : current.group,
        pattern: String(data.pattern ?? current.pattern),
        replacement: String(data.replacement ?? current.replacement),
        scope: data.scope != null ? String(data.scope) : current.scope,
        excludeScope: data.excludeScope != null ? String(data.excludeScope) : current.excludeScope,
        scopeTitle: data.scopeTitle ?? current.scopeTitle,
        scopeContent: data.scopeContent ?? current.scopeContent,
        isEnabled: data.isEnabled ?? current.isEnabled,
        isRegex: data.isRegex ?? current.isRegex,
        timeoutMillisecond: Number(data.timeoutMillisecond ?? current.timeoutMillisecond),
        order: Number(data.order ?? current.order),
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

  const runTest = async () => {
    const d = draft();
    if (!d) return;
    const err = validateRule(d);
    if (err) {
      showAppToast({ title: err, variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const out = await testReplaceRule(d, testSample());
      setTestResult(out);
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const isEditing = () => 'id' in (draft() ?? {}) && Boolean((draft() as ReplaceRule).id);
  const useViewerStacked = () => (props.overlayLayer ?? 'app') === 'viewer-stacked';
  const dialogShell = () => (useViewerStacked() ? ViewerAppDialog : AppDialog);
  const dialogPanel = () => (useViewerStacked() ? ViewerAppStackedDialogContent : AppDialogContent);

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
  };

  return (
    <Dynamic
      component={dialogShell()}
      open={props.open}
      onOpenChange={handleOpenChange}
      modal={useViewerStacked() ? false : undefined}
    >
      <Dynamic
        component={dialogPanel()}
        class="flex max-h-[90dvh] max-w-lg flex-col overflow-hidden"
      >
        <AppDialogHeader>
          <AppDialogTitle>{isEditing() ? '编辑替换规则' : '新建替换规则'}</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogScrollBodySpaceY3}>
          <div>
            <Label>名称</Label>
            <AppTextField class="mt-1">
              <AppTextFieldInput
                value={draft()?.name ?? ''}
                onInput={(e) =>
                  setDraft({ ...(draft() as ReplaceRuleDraft), name: e.currentTarget.value })
                }
              />
            </AppTextField>
          </div>
          <div>
            <Label>分组（可选）</Label>
            <AppTextField class="mt-1">
              <AppTextFieldInput
                value={draft()?.group ?? ''}
                onInput={(e) =>
                  setDraft({ ...(draft() as ReplaceRuleDraft), group: e.currentTarget.value || undefined })
                }
              />
            </AppTextField>
          </div>
          <div>
            <Label>匹配（正则或文本）</Label>
            <AppTextField class="mt-1">
              <AppTextFieldTextArea
                value={draft()?.pattern ?? ''}
                onInput={(e) =>
                  setDraft({ ...(draft() as ReplaceRuleDraft), pattern: e.currentTarget.value })
                }
                rows={4}
                class="font-mono text-xs"
              />
            </AppTextField>
          </div>
          <div>
            <Label>替换为</Label>
            <AppTextField class="mt-1">
              <AppTextFieldTextArea
                value={draft()?.replacement ?? ''}
                onInput={(e) =>
                  setDraft({ ...(draft() as ReplaceRuleDraft), replacement: e.currentTarget.value })
                }
                rows={2}
                class="font-mono text-xs"
              />
            </AppTextField>
          </div>
          <div>
            <Label>作用范围（书名/书源，可选）</Label>
            <AppTextField class="mt-1">
              <AppTextFieldInput
                value={draft()?.scope ?? ''}
                onInput={(e) =>
                  setDraft({ ...(draft() as ReplaceRuleDraft), scope: e.currentTarget.value || undefined })
                }
              />
            </AppTextField>
          </div>
          <div>
            <Label>排除范围（可选）</Label>
            <AppTextField class="mt-1">
              <AppTextFieldInput
                value={draft()?.excludeScope ?? ''}
                onInput={(e) =>
                  setDraft({
                    ...(draft() as ReplaceRuleDraft),
                    excludeScope: e.currentTarget.value || undefined,
                  })
                }
              />
            </AppTextField>
          </div>
          <div class="flex flex-wrap gap-4 text-sm">
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft()?.scopeContent ?? true}
                onChange={(e) =>
                  setDraft({ ...(draft() as ReplaceRuleDraft), scopeContent: e.currentTarget.checked })
                }
              />
              作用于正文
            </label>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft()?.scopeTitle ?? false}
                onChange={(e) =>
                  setDraft({ ...(draft() as ReplaceRuleDraft), scopeTitle: e.currentTarget.checked })
                }
              />
              作用于标题
            </label>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft()?.isRegex ?? true}
                onChange={(e) =>
                  setDraft({ ...(draft() as ReplaceRuleDraft), isRegex: e.currentTarget.checked })
                }
              />
              正则匹配
            </label>
          </div>
          <div>
            <Label>超时（毫秒）</Label>
            <AppTextField class="mt-1">
              <AppTextFieldInput
                type="number"
                value={String(draft()?.timeoutMillisecond ?? 3000)}
                onInput={(e) =>
                  setDraft({
                    ...(draft() as ReplaceRuleDraft),
                    timeoutMillisecond: Number(e.currentTarget.value) || 3000,
                  })
                }
              />
            </AppTextField>
          </div>
          <div>
            <Label>测试文本</Label>
            <AppTextField class="mt-1">
              <AppTextFieldTextArea
                value={testSample()}
                onInput={(e) => setTestSample(e.currentTarget.value)}
                rows={3}
                class="font-mono text-xs"
                placeholder="粘贴待测试正文片段"
              />
            </AppTextField>
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={testing()}
              onClick={() => void runTest()}
            >
              {testing() ? '测试中…' : '测试规则'}
            </Button>
          </div>
          <Show when={testResult()}>
            <div>
              <Label>测试结果</Label>
              <pre class="mt-1 max-h-40 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap">
                {testResult()}
              </pre>
            </div>
          </Show>
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
      </Dynamic>
    </Dynamic>
  );
}

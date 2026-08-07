/**
 * 源脚本直接编辑弹窗（CodeMirror + 关闭时未保存检查）
 * 展示名写入数据库 name 列，与 script/JSON 内真实名称分离
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { AppTextInputContextMenu } from '@/components/shared/AppTextInputContextMenu';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { SourceCodeEditor } from '@/components/shared/SourceCodeEditor';
import { cn } from '@/lib/utils';

export interface SourceScriptEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialValue: string;
  /** 数据库中用于列表展示的名称 */
  initialDisplayName?: string;
  /** 展示名输入框标签 */
  displayNameLabel?: string;
  language: 'json' | 'javascript';
  onSave: (value: string, displayName: string) => void | Promise<void>;
  saving?: boolean;
  portalZClass?: string;
}

export function SourceScriptEditDialog(props: SourceScriptEditDialogProps) {
  const [text, setText] = createSignal('');
  const [displayName, setDisplayName] = createSignal('');
  const [baseline, setBaseline] = createSignal('');
  const [baselineName, setBaselineName] = createSignal('');
  const [discardOpen, setDiscardOpen] = createSignal(false);

  createEffect(() => {
    if (props.open) {
      setText(props.initialValue);
      setBaseline(props.initialValue);
      const name = props.initialDisplayName ?? '';
      setDisplayName(name);
      setBaselineName(name);
    }
  });

  const isDirty = () => text() !== baseline() || displayName() !== baselineName();

  const closeWithoutCheck = () => {
    setDiscardOpen(false);
    props.onOpenChange(false);
  };

  const requestClose = (open: boolean) => {
    if (open) {
      props.onOpenChange(true);
      return;
    }
    if (isDirty()) {
      setDiscardOpen(true);
      return;
    }
    closeWithoutCheck();
  };

  const handleSave = async () => {
    await props.onSave(text(), displayName().trim());
    setBaseline(text());
    setBaselineName(displayName().trim());
    closeWithoutCheck();
  };

  const handleDiscard = () => {
    setDiscardOpen(false);
    closeWithoutCheck();
  };

  const canSave = () => Boolean(text().trim() && displayName().trim());

  return (
    <>
      <AppDialog open={props.open} onOpenChange={requestClose} modal>
        <AppDialogContent
          class={cn('flex max-h-[min(92vh,800px)] max-w-3xl flex-col gap-4')}
          portalToBody
          portalZClass={props.portalZClass}
        >
          <AppDialogHeader>
            <AppDialogTitle>{props.title}</AppDialogTitle>
            <Show when={props.description}>
              <AppDialogDescription>{props.description}</AppDialogDescription>
            </Show>
          </AppDialogHeader>
          <div class="min-h-0 flex-1 space-y-3 px-6 pb-4">
            <div class="space-y-1.5">
              <Label for="source-script-display-name">
                {props.displayNameLabel ?? '显示名称'}
              </Label>
              <AppTextInputContextMenu>
                <input
                  id="source-script-display-name"
                  class="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                  value={displayName()}
                  placeholder="列表中展示的名称"
                  onInput={(e) => setDisplayName(e.currentTarget.value)}
                />
              </AppTextInputContextMenu>
              <p class="text-[11px] text-muted-foreground">
                仅修改本地展示名，不会改写脚本 / JSON 内的真实名称。
              </p>
            </div>
            <SourceCodeEditor
              class="h-[min(52vh,440px)]"
              value={text()}
              onChange={setText}
              language={props.language}
              ariaLabel={props.title}
            />
          </div>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => requestClose(false)} disabled={props.saving}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={props.saving || !canSave()}>
              {props.saving ? '保存中…' : '保存'}
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={discardOpen()} onOpenChange={setDiscardOpen}>
        <AppDialogContent class="max-w-sm" portalZClass={props.portalZClass ?? 'z-[80]'}>
          <AppDialogHeader>
            <AppDialogTitle>未保存的修改</AppDialogTitle>
            <AppDialogDescription>
              当前有未保存的修改，离开前请选择如何处理。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter class="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              class="w-full"
              onClick={() => void handleSave()}
              disabled={props.saving || !canSave()}
            >
              {props.saving ? '保存中…' : '保存并退出'}
            </Button>
            <Button variant="outline" class="w-full" onClick={handleDiscard} disabled={props.saving}>
              不保存退出
            </Button>
            <Button
              variant="ghost"
              class="w-full"
              onClick={() => setDiscardOpen(false)}
              disabled={props.saving}
            >
              取消
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </>
  );
}

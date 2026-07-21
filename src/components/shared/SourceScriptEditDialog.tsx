/**
 * 源脚本直接编辑弹窗（CodeMirror + 关闭时未保存检查）
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
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
  language: 'json' | 'javascript';
  onSave: (value: string) => void | Promise<void>;
  saving?: boolean;
  portalZClass?: string;
}

export function SourceScriptEditDialog(props: SourceScriptEditDialogProps) {
  const [text, setText] = createSignal('');
  const [baseline, setBaseline] = createSignal('');
  const [discardOpen, setDiscardOpen] = createSignal(false);

  createEffect(() => {
    if (props.open) {
      setText(props.initialValue);
      setBaseline(props.initialValue);
    }
  });

  const isDirty = () => text() !== baseline();

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
    await props.onSave(text());
    setBaseline(text());
    closeWithoutCheck();
  };

  const handleDiscard = () => {
    setDiscardOpen(false);
    closeWithoutCheck();
  };

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
          <div class="min-h-0 flex-1 px-6 pb-4">
            <SourceCodeEditor
              class="h-[min(56vh,480px)]"
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
            <Button onClick={() => void handleSave()} disabled={props.saving || !text().trim()}>
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
              当前脚本有未保存的修改，离开前请选择如何处理。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter class="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              class="w-full"
              onClick={() => void handleSave()}
              disabled={props.saving || !text().trim()}
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

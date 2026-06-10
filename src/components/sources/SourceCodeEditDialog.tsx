/**
 * 书源规则/代码编辑弹窗（对齐 Legado CodeEditActivity，使用 AppDialog + CodeMirror）
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
import { resolveSourceFieldLanguage } from '@/lib/editor/source-code-language';
import { cn } from '@/lib/utils';

export interface SourceCodeEditTarget {
  title: string;
  value: string;
  tabKey: string;
  fieldKey: string;
}

export interface SourceCodeEditDialogProps {
  open: boolean;
  target: SourceCodeEditTarget | null;
  onOpenChange: (open: boolean) => void;
  onApply: (value: string, meta: { tabKey: string; fieldKey: string }) => void;
  portalZClass?: string;
}

export function SourceCodeEditDialog(props: SourceCodeEditDialogProps) {
  const [text, setText] = createSignal('');

  createEffect(() => {
    if (props.open && props.target) {
      setText(props.target.value);
    }
  });

  function handleApply() {
    const t = props.target;
    if (!t) return;
    props.onApply(text(), { tabKey: t.tabKey, fieldKey: t.fieldKey });
    props.onOpenChange(false);
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <Show when={props.target}>
        {(target) => (
          <AppDialogContent
            class={cn('flex max-h-[min(92vh,800px)] max-w-3xl flex-col gap-4')}
            portalZClass={props.portalZClass ?? 'z-[70]'}
          >
            <AppDialogHeader>
              <AppDialogTitle>{target().title}</AppDialogTitle>
              <AppDialogDescription>全屏编辑规则或脚本，支持行号与语法高亮。</AppDialogDescription>
            </AppDialogHeader>
            <div class="min-h-0 flex-1 px-6 pb-4">
              <SourceCodeEditor
                class="h-[min(56vh,500px)]"
                value={text()}
                onChange={setText}
                language={resolveSourceFieldLanguage(target().fieldKey)}
                ariaLabel={target().title}
              />
            </div>
            <AppDialogFooter>
              <Button variant="outline" onClick={() => props.onOpenChange(false)}>
                取消
              </Button>
              <Button onClick={handleApply}>确定</Button>
            </AppDialogFooter>
          </AppDialogContent>
        )}
      </Show>
    </AppDialog>
  );
}

/**
 * 全屏代码/规则编辑（对齐 Legado CodeEditActivity）
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Button } from '@/components/ui/button';
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
    <Show when={props.open && props.target}>
      {(target) => (
        <Portal mount={document.body}>
          <div
            class="fixed inset-0 z-70 flex flex-col bg-background"
            role="dialog"
            aria-modal="true"
            aria-label="全屏编辑"
          >
            <header class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 class="min-w-0 truncate text-base font-semibold">{target().title}</h2>
              <div class="flex shrink-0 gap-2">
                <Button variant="outline" onClick={() => props.onOpenChange(false)}>
                  取消
                </Button>
                <Button onClick={handleApply}>确定</Button>
              </div>
            </header>
            <textarea
              class={cn(
                'min-h-0 flex-1 resize-none border-0 bg-background p-4 font-mono text-sm leading-relaxed',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              )}
              aria-label={target().title}
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
            />
          </div>
        </Portal>
      )}
    </Show>
  );
}

/**
 * 书源变量编辑（对齐 Legado VariableDialog / BookSourceEditActivity.setSourceVariable）
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { overlayLayerZ } from '@/lib/ui/overlay-layer-active';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  formatBookSourceVariableComment,
  readBookSourceVariableJson,
  writeBookSourceVariableJson,
} from '@/lib/book-source/source-variables';
import type { BookSource } from '@/types';

export interface SourceVariableDialogProps {
  source: BookSource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SourceVariableDialog(props: SourceVariableDialogProps) {
  const [text, setText] = createSignal('{}');
  const [comment, setComment] = createSignal('');

  createEffect(() => {
    const src = props.source;
    if (!props.open || !src) return;
    setText(readBookSourceVariableJson(src));
    setComment(formatBookSourceVariableComment(src));
  });

  function handleSave() {
    const src = props.source;
    if (!src) return;
    try {
      writeBookSourceVariableJson(src, text());
      showAppToast({
        title: '已保存书源变量',
        description: `「${src.sourceName}」`,
        variant: 'default',
      });
      props.onOpenChange(false);
    } catch (e) {
      showAppToast({
        title: '保存失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  }

  return (
    <Show when={props.open && props.source}>
      {(source) => (
        <Portal mount={document.body}>
          <div
            class={cn(
              'fixed inset-0 flex flex-col bg-background',
              overlayLayerZ().dialog,
            )}
            role="dialog"
            aria-modal="true"
            aria-label="设置源变量"
          >
            <header class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div class="min-w-0">
                <h2 class="truncate text-base font-semibold">设置源变量</h2>
                <p class="truncate text-xs text-muted-foreground">{source().sourceName}</p>
              </div>
              <div class="flex shrink-0 gap-2">
                <Button variant="outline" onClick={() => props.onOpenChange(false)}>
                  取消
                </Button>
                <Button onClick={handleSave}>保存</Button>
              </div>
            </header>
            <Show when={comment()}>
              <p class="shrink-0 whitespace-pre-wrap border-b border-border/60 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                {comment()}
              </p>
            </Show>
            <p class="shrink-0 px-4 pt-2 text-xs text-muted-foreground">
              与 Legado 共用账号时，可在此设置{' '}
              <code class="rounded bg-muted px-1">"deviceId":"715526ded4651ef6"</code>{' '}
              等字段；勿在正文规则里硬编码（不会写入 Cookie）。
            </p>
            <textarea
              class={cn(
                'min-h-0 flex-1 resize-none border-0 bg-background px-4 pb-4 pt-2 font-mono text-sm leading-relaxed',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              )}
              aria-label="书源变量 JSON"
              spellcheck={false}
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
            />
          </div>
        </Portal>
      )}
    </Show>
  );
}

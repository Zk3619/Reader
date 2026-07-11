import { appDialogScrollBodySpaceY4 } from '@/lib/ui/viewport-classes';
/**
 * 书源图片验证码 / 自定义输入（对齐 Legado VerificationCodeDialog）
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import type { SourceVerificationRequest } from '@/lib/book-source/source-verification';
import { APP_INNER_WEB_DIALOG_Z } from '@/lib/ui/overlay-z';

export interface SourceVerificationDialogProps {
  request: SourceVerificationRequest | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function SourceVerificationDialog(props: SourceVerificationDialogProps) {
  const [input, setInput] = createSignal('');

  createEffect(() => {
    if (props.request) setInput('');
  });

  const open = () => props.request != null;

  function handleOpenChange(next: boolean) {
    if (!next) props.onCancel();
  }

  function handleSubmit() {
    const value = input().trim();
    if (!value) return;
    props.onSubmit(value);
  }

  return (
    <AppDialog open={open()} onOpenChange={handleOpenChange} modal>
      <AppDialogContent portalToBody portalZClass={APP_INNER_WEB_DIALOG_Z} class="max-w-md">
        <AppDialogHeader>
          <AppDialogTitle>输入验证</AppDialogTitle>
          <Show when={props.request}>
            {(req) => (
              <AppDialogDescription class="truncate">{req().sourceName}</AppDialogDescription>
            )}
          </Show>
        </AppDialogHeader>

        <Show when={props.request}>
          {(req) => (
            <AppDialogScrollBody class={appDialogScrollBodySpaceY4}>
              <div class="flex min-h-30 items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-muted/20 p-6 sm:p-8">
                <img
                  src={req().imageUrl}
                  alt="验证码"
                  class="max-h-44 w-full object-contain"
                />
              </div>
              <AppTextField>
                <AppTextFieldInput
                  placeholder="请输入内容"
                  value={input()}
                  onInput={(e: Event) =>
                    setInput((e.currentTarget as HTMLInputElement).value)
                  }
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
              </AppTextField>
            </AppDialogScrollBody>
          )}
        </Show>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onCancel()}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!input().trim()}>
            确定
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

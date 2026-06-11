/**
 * 代码导入：粘贴 JSON 或深链接文本（CodeMirror 编辑）
 */

import { createSignal, createEffect } from 'solid-js';
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

export interface ImportCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIdentify: (text: string) => void;
  title?: string;
  description?: string;
  portalZClass?: string;
  confirmLabel?: string;
}

export function ImportCodeDialog(props: ImportCodeDialogProps) {
  const [text, setText] = createSignal('');

  createEffect(() => {
    if (props.open) {
      setText('');
    }
  });

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) setText('');
  };

  const handleIdentify = () => {
    const value = text().trim();
    if (!value) return;
    props.onIdentify(value);
    handleOpenChange(false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange} modal>
      <AppDialogContent
        class={cn('flex max-h-[min(92vh,800px)] max-w-3xl flex-col gap-4')}
        portalToBody
        portalZClass={props.portalZClass}
      >
        <AppDialogHeader>
          <AppDialogTitle>{props.title ?? '代码导入'}</AppDialogTitle>
          <AppDialogDescription>
            {props.description ??
              '粘贴 JSON 数组或对象，也支持 legado:// / yuedu:// 深链接与 http(s) 地址。'}
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="min-h-0 flex-1 px-6 pb-4">
          <SourceCodeEditor
            class="h-[min(56vh,480px)]"
            value={text()}
            onChange={setText}
            language="json"
            ariaLabel={props.title ?? '代码导入'}
          />
        </div>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleIdentify} disabled={!text().trim()}>
            {props.confirmLabel ?? '识别'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

import { createSignal } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldTextArea } from '@/components/ui/text-field';

export interface ImportSourceQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIdentify: (raw: string) => void;
  /** 内嵌页会话时须高于 .reader-inner-web-layer（如 z-[160]） */
  portalZClass?: string;
}

export function ImportSourceQrDialog(props: ImportSourceQrDialogProps) {
  const [raw, setRaw] = createSignal('');

  const handleIdentify = () => {
    const value = raw().trim();
    if (!value) return;
    props.onIdentify(value);
    props.onOpenChange(false);
    setRaw('');
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent portalZClass={props.portalZClass}>
        <AppDialogHeader>
          <AppDialogTitle>二维码导入书源</AppDialogTitle>
          <AppDialogDescription>
            粘贴二维码内容（可为 `yuedu://`、`legado://` 或 http/https 书源地址）进行识别。
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="min-h-0 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <section class="rounded-lg border border-border/50 bg-muted/20 p-4">
            <TextField>
              <TextFieldTextArea
                value={raw()}
                onInput={(e: Event) => setRaw((e.currentTarget as HTMLTextAreaElement).value)}
                placeholder="yuedu://booksource/importonline?src=..."
                rows={4}
              />
            </TextField>
          </section>
        </div>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleIdentify} disabled={!raw().trim()}>
            确定
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

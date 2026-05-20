/**
 * 书源网络导入对话框
 * 对齐 legado：输入书源 JSON 的 URL，拉取后解析并导入
 */

import { createEffect, createSignal } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/AppDialog';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';

export interface ImportSourceNetworkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIdentify: (url: string) => void;
  /** 内嵌页会话时须高于 .reader-inner-web-layer（如 z-[160]） */
  portalZClass?: string;
  /** 打开时写入输入框（如内嵌页 yuedu 深链转成 http 书源链接） */
  presetUrl?: string;
}

export function ImportSourceNetworkDialog(props: ImportSourceNetworkDialogProps) {
  const [url, setUrl] = createSignal('');

  createEffect(() => {
    if (props.open) {
      const p = props.presetUrl?.trim();
      if (p) setUrl(p);
    }
  });

  const handleIdentify = async () => {
    const u = url().trim();
    if (!u) return;
    props.onIdentify(u);
    setUrl('');
    props.onOpenChange(false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent portalZClass={props.portalZClass}>
        <AppDialogHeader>
          <AppDialogTitle>网络导入书源</AppDialogTitle>
          <AppDialogDescription>
            输入书源 JSON 的链接（http/https），将拉取并导入，兼容 legado 书源格式。桌面端由应用内网络拉取，不受跨域限制；浏览器环境下若遇跨域请改用「本地导入」。
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="min-h-0 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <section class="rounded-lg border border-border/50 bg-muted/20 p-4">
            <TextField>
              <TextFieldInput
                placeholder="https://example.com/bookSources.json"
                value={url()}
                onInput={(e: Event) => setUrl((e.currentTarget as HTMLInputElement).value)}
              />
            </TextField>
          </section>
        </div>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleIdentify} disabled={!url().trim()}>
            识别
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

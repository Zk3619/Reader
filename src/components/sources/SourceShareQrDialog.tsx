/**
 * 分享书源为二维码（对齐 Legado shareWithQr）
 */

import { createSignal, createEffect, Show } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';
import { renderQrDataUrl } from '@/lib/qr/render-qrcode';

export interface SourceShareQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Legado 书源 JSON 字符串 */
  jsonText: string;
}

export function SourceShareQrDialog(props: SourceShareQrDialogProps) {
  const [dataUrl, setDataUrl] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  createEffect(() => {
    if (!props.open) {
      setDataUrl(null);
      return;
    }
    const text = props.jsonText.trim();
    if (!text) return;
    setLoading(true);
    void renderQrDataUrl(text)
      .then(setDataUrl)
      .catch((e) => {
        showAppToast({
          title: '生成二维码失败',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      })
      .finally(() => setLoading(false));
  });

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="max-w-sm">
        <AppDialogHeader>
          <AppDialogTitle>分享书源</AppDialogTitle>
          <AppDialogDescription>扫描二维码导入书源（与 Legado 分享格式兼容）</AppDialogDescription>
        </AppDialogHeader>
        <div class="flex flex-col items-center gap-3 py-2">
          <Show
            when={!loading() && dataUrl()}
            fallback={
              <p class="py-12 text-sm text-muted-foreground">
                {loading() ? '生成中…' : '内容为空'}
              </p>
            }
          >
            {(url) => (
              <img
                src={url()}
                alt="书源二维码"
                class="h-auto w-[min(280px,80vw)] rounded-lg border border-border bg-white p-2"
              />
            )}
          </Show>
        </div>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

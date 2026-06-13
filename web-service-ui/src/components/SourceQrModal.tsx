import { createEffect, createSignal, Show } from 'solid-js';
import { Card, Button } from '@/components/Layout';
import { renderQrDataUrl } from '@/lib/render-qrcode';

interface SourceQrModalProps {
  open: boolean;
  jsonText: string;
  onClose: () => void;
}

export function SourceQrModal(props: SourceQrModalProps) {
  const [dataUrl, setDataUrl] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');

  createEffect(() => {
    if (!props.open) {
      setDataUrl('');
      setError('');
      return;
    }
    const text = props.jsonText.trim();
    if (!text) {
      setError('书源内容为空');
      return;
    }
    setLoading(true);
    setError('');
    void renderQrDataUrl(text)
      .then(setDataUrl)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  });

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <Card class="w-full max-w-sm space-y-3 text-center">
          <h2 class="text-lg font-semibold">二维码分享</h2>
          <p class="text-sm text-muted-foreground">扫描二维码导入书源（Legado 格式）</p>
          <Show when={error()}>
            <p class="text-sm web-text-danger">{error()}</p>
          </Show>
          <Show when={loading()}>
            <p class="py-8 text-sm text-muted-foreground">生成中…</p>
          </Show>
          <Show when={!loading() && dataUrl()}>
            <img
              src={dataUrl()}
              alt="书源二维码"
              class="mx-auto h-auto w-[min(280px,80vw)] rounded-lg border border-border bg-white p-2"
            />
          </Show>
          <div class="flex justify-end">
            <Button variant="ghost" onClick={props.onClose}>
              关闭
            </Button>
          </div>
        </Card>
      </div>
    </Show>
  );
}

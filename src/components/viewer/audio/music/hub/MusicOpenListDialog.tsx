/**
 * OpenList：通过 URL 打开在线歌单
 */

import { createSignal, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { openListFromUrlInput } from '@/stores/music-hub/songList';

export interface MusicOpenListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MusicOpenListDialog: Component<MusicOpenListDialogProps> = (props) => {
  const [url, setUrl] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  const submit = async () => {
    const value = url().trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    const ok = await openListFromUrlInput(value);
    setLoading(false);
    if (ok) {
      props.onOpenChange(false);
      setUrl('');
    } else {
      setError('无法识别歌单链接');
    }
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="w-full max-w-md rounded-lg border bg-background p-4 shadow-lg">
          <h3 class="mb-3 font-medium">打开歌单链接</h3>
          <input
            class="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="粘贴歌单 URL 或 ID"
            value={url()}
            onInput={(e: InputEvent) => setUrl((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && void submit()}
          />
          <Show when={error()}>
            <p class="mt-2 text-sm text-destructive">{error()}</p>
          </Show>
          <div class="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={() => void submit()} disabled={loading()}>
              {loading() ? '解析中…' : '打开'}
            </Button>
          </div>
        </div>
      </div>
    </Show>
  );
};

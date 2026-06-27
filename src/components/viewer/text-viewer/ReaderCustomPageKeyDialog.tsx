/**
 * 自定义翻页按键（对齐 Legado PageKeyDialog）
 */

import { createSignal, For, onCleanup, onMount } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';

export interface ReaderCustomPageKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReaderCustomPageKeyDialog(props: ReaderCustomPageKeyDialogProps) {
  const [capturing, setCapturing] = createSignal<'prev' | 'next' | null>(null);
  const [prevKeys, setPrevKeys] = createSignal<string[]>([]);
  const [nextKeys, setNextKeys] = createSignal<string[]>([]);

  const syncFromStore = () => {
    const keys = textViewerStore.state.config.customPageKeys;
    setPrevKeys(keys?.prev ? [...keys.prev] : []);
    setNextKeys(keys?.next ? [...keys.next] : []);
  };

  onMount(() => {
    syncFromStore();
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    const mode = capturing();
    if (!mode) return;
    e.preventDefault();
    e.stopPropagation();
    const code = e.code;
    if (!code) return;
    if (mode === 'prev') {
      setPrevKeys((prev) => (prev.includes(code) ? prev : [...prev, code]));
    } else {
      setNextKeys((prev) => (prev.includes(code) ? prev : [...prev, code]));
    }
    setCapturing(null);
  };

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown, true));
  });

  const save = () => {
    textViewerStore.setConfig({
      customPageKeys: { prev: prevKeys(), next: nextKeys() },
    });
    props.onOpenChange(false);
  };

  const clearAll = () => {
    setPrevKeys([]);
    setNextKeys([]);
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent class="w-[calc(100dvw-2rem)] max-w-md">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>自定义翻页按键</ViewerAppDialogTitle>
        </ViewerAppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex}>
          <div class="space-y-4">
            <div class="space-y-2">
              <Label>上一页 / 上一章</Label>
              <div class="flex flex-wrap gap-1">
                <For each={prevKeys()} fallback={<span class="text-xs text-muted-foreground">未设置</span>}>
                  {(code) => (
                    <button
                      type="button"
                      class="rounded bg-muted px-2 py-0.5 text-xs"
                      onClick={() => setPrevKeys((k) => k.filter((x) => x !== code))}
                    >
                      {code} ×
                    </button>
                  )}
                </For>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCapturing('prev')}
              >
                {capturing() === 'prev' ? '请按下按键…' : '添加上一页键'}
              </Button>
            </div>
            <div class="space-y-2">
              <Label>下一页 / 下一章</Label>
              <div class="flex flex-wrap gap-1">
                <For each={nextKeys()} fallback={<span class="text-xs text-muted-foreground">未设置</span>}>
                  {(code) => (
                    <button
                      type="button"
                      class="rounded bg-muted px-2 py-0.5 text-xs"
                      onClick={() => setNextKeys((k) => k.filter((x) => x !== code))}
                    >
                      {code} ×
                    </button>
                  )}
                </For>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCapturing('next')}
              >
                {capturing() === 'next' ? '请按下按键…' : '添加下一页键'}
              </Button>
            </div>
            <div class="flex gap-2">
              <Button variant="outline" class="flex-1" onClick={clearAll}>
                清空
              </Button>
              <Button class="flex-1" onClick={save}>
                保存
              </Button>
            </div>
          </div>
        </AppDialogScrollBody>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
}

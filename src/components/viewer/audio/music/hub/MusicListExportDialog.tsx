/**
 * 导出列表：先选方式，再执行
 */

import { For, Show, createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppTextField,
  AppTextFieldInput,
  AppTextFieldLabel,
} from '@/components/shared/AppTextField';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { viewerStore } from '@/stores/viewer';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  buildPlaylistSharePayload,
  downloadPlaylistShareFile,
  encodePlaylistShareCode,
  toPlaylistShareAddress,
} from '@/lib/media/audio/list/playlist-share';
import { cn } from '@/lib/utils';

export type MusicListExportMethod = 'file' | 'code' | 'address';

export interface MusicListExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const METHODS: Array<{ id: MusicListExportMethod; title: string; desc: string }> = [
  { id: 'file', title: '文件', desc: '下载 JSON 歌单文件' },
  { id: 'code', title: '分享码', desc: '复制到剪贴板，便于粘贴导入' },
  { id: 'address', title: '地址', desc: '复制可读链接形式的分享地址' },
];

export const MusicListExportDialog: Component<MusicListExportDialogProps> = (props) => {
  const [step, setStep] = createSignal<'pick' | MusicListExportMethod>('pick');
  const [resultText, setResultText] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const reset = () => {
    setStep('pick');
    setResultText('');
    setBusy(false);
  };

  const activePlaylistId = () => {
    const id = viewerStore.state.activePlaylistId;
    return id?.startsWith('pl_') ? id : null;
  };

  const runExport = async (method: MusicListExportMethod) => {
    const listId = activePlaylistId();
    if (!listId) {
      showAppToast({ title: '请先选择用户歌单', variant: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const payload = await buildPlaylistSharePayload(listId);
      if (!payload) throw new Error('empty');
      const code = encodePlaylistShareCode(payload);
      if (method === 'file') {
        downloadPlaylistShareFile(payload);
        showAppToast({ title: '已导出文件', variant: 'success' });
        props.onOpenChange(false);
        reset();
        return;
      }
      const text = method === 'address' ? toPlaylistShareAddress(code) : code;
      await navigator.clipboard.writeText(text);
      setResultText(text);
      setStep(method);
      showAppToast({
        title: method === 'address' ? '地址已复制' : '分享码已复制',
        variant: 'success',
      });
    } catch (e) {
      showAppToast({ title: '导出失败', description: String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewerAppDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) reset();
        props.onOpenChange(open);
      }}
    >
      <ViewerAppDialogContent layout="plain" class="max-w-md">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>导出列表</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            {step() === 'pick' ? '选择导出方式' : '已生成导出内容'}
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>

        <Show when={step() === 'pick'}>
          <ul class="space-y-2">
            <For each={METHODS}>
              {(m) => (
                <li>
                  <Button
                    type="button"
                    variant="outline"
                    class="h-auto w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left font-normal"
                    disabled={busy()}
                    onClick={() => void runExport(m.id)}
                  >
                    <span class="text-sm font-medium">{m.title}</span>
                    <span class="text-xs text-muted-foreground">{m.desc}</span>
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <Show when={step() === 'code' || step() === 'address'}>
          <AppTextField>
            <AppTextFieldLabel>{step() === 'address' ? '地址' : '分享码'}</AppTextFieldLabel>
            <AppTextFieldInput
              class={cn('font-mono text-xs')}
              readOnly
              value={resultText()}
              onFocus={(e: FocusEvent & { currentTarget: HTMLInputElement }) =>
                e.currentTarget.select()
              }
            />
          </AppTextField>
        </Show>

        <ViewerAppDialogFooter>
          <Show when={step() !== 'pick'}>
            <Button variant="outline" class="mr-auto" onClick={() => setStep('pick')}>
              返回
            </Button>
          </Show>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};

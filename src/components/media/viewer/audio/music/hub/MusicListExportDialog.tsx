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
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import { viewerStore } from '@/stores/viewer';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import {
  buildPlaylistSharePayload,
  downloadPlaylistShareFile,
  encodePlaylistShareCode,
  toPlaylistShareAddress,
} from '@/lib/media/audio/list/playlist-share';
import { cn } from '@/lib/utils';
import {
  appDialogScrollBodySpaceY3,
  dialogScrollFrameFlex,
} from '@/lib/ui/viewport-classes';

export type MusicListExportMethod = 'file' | 'lxmc' | 'code' | 'address';

export interface MusicListExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const METHODS: Array<{ id: MusicListExportMethod; title: string; desc: string }> = [
  { id: 'file', title: '文件 (JSON)', desc: '下载 Reader JSON 歌单文件' },
  { id: 'lxmc', title: '文件 (LXMC)', desc: '下载 LX 兼容 .lxmc 分片（gzip）' },
  { id: 'code', title: '分享码', desc: '复制到剪贴板，便于粘贴导入' },
  { id: 'address', title: '地址', desc: '复制可读链接形式的分享地址' },
];

const methodOptionClass =
  'h-auto w-full flex-col items-start gap-0.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-left font-normal transition-colors hover:bg-muted/40';

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
        showAppToast({ title: '已导出 JSON 文件', variant: 'success' });
        props.onOpenChange(false);
        reset();
        return;
      }
      if (method === 'lxmc') {
        const { downloadPlaylistAsLxmc } = await import(
          '@/lib/media/audio/list/playlist-lxmc'
        );
        downloadPlaylistAsLxmc(payload);
        showAppToast({ title: '已导出 LXMC 文件', variant: 'success' });
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
      showAppToast({ title: '导出失败', description: toUserFacingMusicError(e), variant: 'destructive' });
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
      <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-md">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>导出列表</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            {step() === 'pick' ? '选择导出方式' : '已生成导出内容，可复制或返回重新选择'}
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>

        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogScrollBodySpaceY3}>
          <Show when={step() === 'pick'}>
            <ul class="space-y-2">
              <For each={METHODS}>
                {(m) => (
                  <li>
                    <Button
                      type="button"
                      variant="ghost"
                      class={methodOptionClass}
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
        </AppDialogScrollBody>

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

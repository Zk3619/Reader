/**
 * 导入列表：先选方式，再继续（文件 / 码 / 地址 / 本地 / 平台链接）
 */

import { For, Show, createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppTextField,
  AppTextFieldInput,
  AppTextFieldLabel,
  AppTextFieldTextArea,
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
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { pickFile } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import {
  decodePlaylistShareCode,
  importPlaylistSharePayload,
  parsePlaylistShareJson,
} from '@/lib/media/audio/list/playlist-share';
import { openListFromUrlInput } from '@/stores/music-hub/songList';
import { MusicOpenListDialog } from '@/components/viewer/audio/music/hub/MusicOpenListDialog';
import { cn } from '@/lib/utils';

export type MusicListImportMethod =
  | 'file'
  | 'code'
  | 'address'
  | 'local'
  | 'platform';

export interface MusicListImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
  onScanLocal?: () => void;
}

const METHODS: Array<{ id: MusicListImportMethod; title: string; desc: string }> = [
  { id: 'file', title: '文件', desc: '从 JSON / lxmc 歌单文件导入' },
  { id: 'code', title: '分享码', desc: '粘贴分享码合并到当前列表或新建' },
  { id: 'address', title: '地址', desc: '网络地址或 reader-music-list 链接' },
  { id: 'local', title: '本地目录或文件', desc: '扫描本地音频导入曲库' },
  { id: 'platform', title: '音乐平台歌单链接', desc: '打开网易云等在线歌单' },
];

export const MusicListImportDialog: Component<MusicListImportDialogProps> = (props) => {
  const [step, setStep] = createSignal<'pick' | MusicListImportMethod>('pick');
  const [input, setInput] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [platformOpen, setPlatformOpen] = createSignal(false);

  const reset = () => {
    setStep('pick');
    setInput('');
    setBusy(false);
  };

  const activeUserPlaylistId = () => {
    const id = viewerStore.state.activePlaylistId;
    return id?.startsWith('pl_') ? id : null;
  };

  const finishImport = (count: number) => {
    showAppToast({ title: `已导入 ${count} 首`, variant: 'success' });
    props.onImported?.();
    props.onOpenChange(false);
    reset();
  };

  const importPayloadText = async (text: string, asCode: boolean) => {
    const payload = asCode
      ? decodePlaylistShareCode(text)
      : text.trim().startsWith('{')
        ? parsePlaylistShareJson(text)
        : decodePlaylistShareCode(text);
    const target = activeUserPlaylistId();
    const result = await importPlaylistSharePayload(payload, {
      targetPlaylistId: target ?? undefined,
      merge: !!target,
    });
    finishImport(result.count);
  };

  const pickImportMethod = async (method: MusicListImportMethod) => {
    if (method === 'local') {
      props.onOpenChange(false);
      reset();
      props.onScanLocal?.();
      return;
    }
    if (method === 'platform') {
      props.onOpenChange(false);
      reset();
      setPlatformOpen(true);
      return;
    }
    if (method === 'file') {
      setBusy(true);
      try {
        const picked = await pickFile({
          multiple: false,
          filters: [
            { name: 'Playlist', extensions: ['json', 'lxmc'] },
            { name: 'All', extensions: ['*'] },
          ],
        });
        const bytes = picked.bytes;
        if (!bytes) {
          showAppToast({ title: '无法读取文件', variant: 'destructive' });
          return;
        }
        const text = new TextDecoder().decode(bytes);
        let payload;
        try {
          payload = parsePlaylistShareJson(text);
        } catch {
          payload = decodePlaylistShareCode(text);
        }
        const target = activeUserPlaylistId();
        const result = await importPlaylistSharePayload(payload, {
          targetPlaylistId: target ?? undefined,
          merge: !!target,
        });
        finishImport(result.count);
      } catch (e) {
        if (!isUserCancelled(e)) {
          showAppToast({ title: '导入失败', description: toUserFacingMusicError(e), variant: 'destructive' });
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    setStep(method);
  };

  const submitText = async () => {
    const value = input().trim();
    if (!value) return;
    setBusy(true);
    try {
      if (step() === 'address') {
        if (/^https?:\/\//i.test(value)) {
          const res = await fetch(value);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          try {
            await importPayloadText(text, false);
          } catch {
            const ok = await openListFromUrlInput(value);
            if (ok) {
              showAppToast({ title: '已打开在线歌单', variant: 'success' });
              props.onOpenChange(false);
              reset();
            } else {
              throw new Error('无法识别');
            }
          }
          return;
        }
        await importPayloadText(value, true);
        return;
      }
      await importPayloadText(value, true);
    } catch (e) {
      showAppToast({ title: '导入失败', description: toUserFacingMusicError(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ViewerAppDialog
        open={props.open}
        onOpenChange={(open) => {
          if (!open) reset();
          props.onOpenChange(open);
        }}
      >
        <ViewerAppDialogContent layout="plain" class="max-w-md">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>导入</ViewerAppDialogTitle>
            <ViewerAppDialogDescription>
              {step() === 'pick'
                ? '选择导入方式'
                : step() === 'code'
                  ? '粘贴分享码'
                  : '粘贴网络地址或分享链接'}
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
                      onClick={() => void pickImportMethod(m.id)}
                    >
                      <span class="text-sm font-medium">{m.title}</span>
                      <span class="text-xs text-muted-foreground">{m.desc}</span>
                    </Button>
                  </li>
                )}
              </For>
            </ul>
            <Show when={activeUserPlaylistId()}>
              <p class="mt-3 text-xs text-muted-foreground">
                当前已选用户歌单：导入内容将合并到该列表；未选时将新建列表。
              </p>
            </Show>
          </Show>

          <Show when={step() === 'code' || step() === 'address'}>
            <div class="space-y-3">
              <Show when={step() === 'code'}>
                <AppTextField>
                  <AppTextFieldLabel>分享码</AppTextFieldLabel>
                  <AppTextFieldTextArea
                    class={cn('min-h-24 font-mono text-xs')}
                    placeholder="粘贴分享码"
                    value={input()}
                    onInput={(e) => setInput(e.currentTarget.value)}
                  />
                </AppTextField>
              </Show>
              <Show when={step() === 'address'}>
                <AppTextField>
                  <AppTextFieldLabel>地址</AppTextFieldLabel>
                  <AppTextFieldInput
                    class="font-mono text-xs"
                    placeholder="https://… 或 reader-music-list:…"
                    value={input()}
                    onInput={(e) => setInput(e.currentTarget.value)}
                    onKeyDown={(e: KeyboardEvent) => {
                      if (e.key === 'Enter') void submitText();
                    }}
                  />
                </AppTextField>
              </Show>
            </div>
          </Show>

          <ViewerAppDialogFooter>
            <Show when={step() !== 'pick'}>
              <Button variant="outline" class="mr-auto" onClick={() => setStep('pick')}>
                返回
              </Button>
            </Show>
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              取消
            </Button>
            <Show when={step() === 'code' || step() === 'address'}>
              <Button disabled={busy() || !input().trim()} onClick={() => void submitText()}>
                {busy() ? '导入中…' : '导入'}
              </Button>
            </Show>
          </ViewerAppDialogFooter>
        </ViewerAppDialogContent>
      </ViewerAppDialog>

      <MusicOpenListDialog open={platformOpen()} onOpenChange={setPlatformOpen} />
    </>
  );
};

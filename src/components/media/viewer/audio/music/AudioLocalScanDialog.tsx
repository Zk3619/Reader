/**
 * 本地扫描对话框
 */

import { createSignal, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import { ImportActionDialog } from '@/components/media/reader/books/ImportActionDialog';
import {
  scanAndImportDirectory,
  importAndroidMusicDirectory,
  importWebDirectory,
} from '@/lib/media/audio/library/playlist-store';
import {
  resolveImportMediaActionOrPrompt,
  type ImportMediaAction,
} from '@/lib/media/local-media-import';
import { open } from '@tauri-apps/plugin-dialog';
import { isTauri } from '@/lib/platform/detect';
import { mayUseAndroidFsLayer } from '@/lib/platform/fs/capabilities';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export interface AudioLocalScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (tracks: AudioTrack[]) => void;
}

export const AudioLocalScanDialog: Component<AudioLocalScanDialogProps> = (props) => {
  const [scanning, setScanning] = createSignal(false);
  const [progress, setProgress] = createSignal('');
  const [actionDialogOpen, setActionDialogOpen] = createSignal(false);
  let pendingActionResolve: ((action: ImportMediaAction | null) => void) | null = null;

  const promptImportAction = async (): Promise<ImportMediaAction | null> => {
    const resolved = await resolveImportMediaActionOrPrompt('music');
    if (resolved !== 'prompt') return resolved;
    return new Promise((resolve) => {
      pendingActionResolve = resolve;
      setActionDialogOpen(true);
    });
  };

  const handleActionConfirm = (action: ImportMediaAction) => {
    pendingActionResolve?.(action);
    pendingActionResolve = null;
    setActionDialogOpen(false);
  };

  const handleActionDialogOpenChange = (open: boolean) => {
    setActionDialogOpen(open);
    if (!open && pendingActionResolve) {
      pendingActionResolve(null);
      pendingActionResolve = null;
    }
  };

  const finishImport = (tracks: AudioTrack[]) => {
    props.onImported(tracks);
    props.onOpenChange(false);
    showAppToast({ title: '导入完成', description: `共 ${tracks.length} 首` });
  };

  const pickAndScan = async () => {
    const action = await promptImportAction();
    if (!action) return;

    if (mayUseAndroidFsLayer()) {
      setScanning(true);
      try {
        const tracks = await importAndroidMusicDirectory(
          (done, total, path) => {
            setProgress(`${done}/${total} — ${path}`);
          },
          action,
        );
        finishImport(tracks);
      } catch (e) {
        showAppToast({ title: '扫描失败', description: toUserFacingMusicError(e), variant: 'destructive' });
      } finally {
        setScanning(false);
        setProgress('');
      }
      return;
    }

    if (!isTauri()) {
      try {
        if (!window.showDirectoryPicker) {
          showAppToast({ title: '不支持', description: '当前浏览器不支持文件夹选择', variant: 'destructive' });
          return;
        }
        const handle = await window.showDirectoryPicker();
        setScanning(true);
        const tracks = await importWebDirectory(handle, action, (done, total, path) => {
          setProgress(`${done}/${total} — ${path}`);
        });
        finishImport(tracks);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          showAppToast({ title: '扫描失败', description: toUserFacingMusicError(e), variant: 'destructive' });
        }
      } finally {
        setScanning(false);
        setProgress('');
      }
      return;
    }

    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== 'string') return;
    setScanning(true);
    try {
      const tracks = await scanAndImportDirectory(
        selected,
        (done, total, path) => {
          setProgress(`${done}/${total} — ${path}`);
        },
        undefined,
        action,
      );
      finishImport(tracks);
    } catch (e) {
      showAppToast({ title: '扫描失败', description: toUserFacingMusicError(e), variant: 'destructive' });
    } finally {
      setScanning(false);
      setProgress('');
    }
  };

  return (
    <>
      <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
        <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-md">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>扫描本地文件夹</ViewerAppDialogTitle>
            <ViewerAppDialogDescription>
              选择包含 mp3、flac、m4a 等音频文件的文件夹，将导入到本地音乐库。可选择复制或移动到
              Audio/Local（或自定义本地音频库）。
            </ViewerAppDialogDescription>
          </ViewerAppDialogHeader>

          <Show when={progress()}>
            <div class="px-6 pb-6">
              <p class="truncate rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {progress()}
              </p>
            </div>
          </Show>

          <ViewerAppDialogFooter>
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              取消
            </Button>
            <Button disabled={scanning()} onClick={() => void pickAndScan()}>
              {scanning() ? '扫描中…' : '选择文件夹'}
            </Button>
          </ViewerAppDialogFooter>
        </ViewerAppDialogContent>
      </ViewerAppDialog>

      <ImportActionDialog
        open={actionDialogOpen()}
        onOpenChange={handleActionDialogOpenChange}
        mediaKind="music"
        onConfirm={(action) => handleActionConfirm(action)}
      />
    </>
  );
};

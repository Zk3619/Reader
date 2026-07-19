/**
 * 本地扫描对话框
 */

import { createSignal, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { scanAndImportDirectory, importAndroidMusicDirectory } from '@/lib/media/audio/library/playlist-store';
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

  const pickAndScan = async () => {
    if (mayUseAndroidFsLayer()) {
      setScanning(true);
      try {
        const tracks = await importAndroidMusicDirectory((done, total, path) => {
          setProgress(`${done}/${total} — ${path}`);
        });
        props.onImported(tracks);
        props.onOpenChange(false);
        showAppToast({ title: '导入完成', description: `共 ${tracks.length} 首` });
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
        const { importWebDirectory } = await import('@/lib/media/audio/library/playlist-store');
        setScanning(true);
        const tracks = await importWebDirectory(handle);
        props.onImported(tracks);
        props.onOpenChange(false);
        showAppToast({ title: '导入完成', description: `共 ${tracks.length} 首` });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          showAppToast({ title: '扫描失败', description: toUserFacingMusicError(e), variant: 'destructive' });
        }
      } finally {
        setScanning(false);
      }
      return;
    }
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== 'string') return;
    setScanning(true);
    try {
      const tracks = await scanAndImportDirectory(selected, (done, total, path) => {
        setProgress(`${done}/${total} — ${path}`);
      });
      props.onImported(tracks);
      props.onOpenChange(false);
      showAppToast({ title: '导入完成', description: `共 ${tracks.length} 首` });
    } catch (e) {
      showAppToast({ title: '扫描失败', description: toUserFacingMusicError(e), variant: 'destructive' });
    } finally {
      setScanning(false);
      setProgress('');
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent>
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>扫描本地文件夹</ViewerAppDialogTitle>
        </ViewerAppDialogHeader>
        <p class="text-sm text-muted-foreground">
          选择包含 mp3、flac、m4a 等音频文件的文件夹，将导入到本地音乐库。
        </p>
        <Show when={progress()}>
          <p class="text-xs text-muted-foreground truncate">{progress()}</p>
        </Show>
        <div class="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={scanning()} onClick={() => void pickAndScan()}>
            {scanning() ? '扫描中…' : '选择文件夹'}
          </Button>
        </div>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};

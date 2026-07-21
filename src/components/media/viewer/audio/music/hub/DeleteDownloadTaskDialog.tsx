import { appDialogScrollBodySpaceY4 } from '@/lib/ui/viewport-classes';
/**
 * 移除下载任务确认：可选同时删除本地下载文件，并允许记住选择
 */

import { createEffect, createSignal, Show } from 'solid-js';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { settingsStore } from '@/stores/settings';
import type { AudioDownloadTask } from '@/lib/media/audio/audio-download';
import { isTauri } from '@/lib/platform/detect';

export interface DeleteDownloadTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: AudioDownloadTask | null;
  onConfirm: (deleteFile: boolean) => void;
}

export function DeleteDownloadTaskDialog(props: DeleteDownloadTaskDialogProps) {
  const [deleteFile, setDeleteFile] = createSignal(false);
  const [remember, setRemember] = createSignal(
    settingsStore.state.app.rememberDeleteDownloadFileAction ?? false,
  );

  const canDeleteFile = () =>
    isTauri() &&
    props.task?.status === 'completed' &&
    Boolean(props.task.localPath && !props.task.localPath.endsWith('.part'));

  const titleName = () => props.task?.trackName?.trim() || props.task?.fileName || '该任务';

  createEffect(() => {
    if (!props.open || !props.task) return;
    const app = settingsStore.state.app;
    const remembered =
      app.rememberDeleteDownloadFileAction && app.deleteDownloadFileAction !== undefined
        ? app.deleteDownloadFileAction
        : false;
    setDeleteFile(canDeleteFile() ? remembered : false);
    setRemember(app.rememberDeleteDownloadFileAction ?? false);
  });

  const handleConfirm = () => {
    const shouldDelete = canDeleteFile() && deleteFile();
    props.onConfirm(shouldDelete);
    if (canDeleteFile()) {
      void settingsStore.setDeleteDownloadFileAction(deleteFile(), remember());
    }
    props.onOpenChange(false);
  };

  const handleCancel = () => {
    props.onOpenChange(false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>移除下载记录</AppDialogTitle>
          <AppDialogDescription>
            确定从下载列表移除「{titleName()}」吗？移除后将不再标记为已下载。
          </AppDialogDescription>
        </AppDialogHeader>
        <Show when={canDeleteFile()}>
          <AppDialogScrollBody class={appDialogScrollBodySpaceY4}>
            <div class="flex items-center space-x-2">
              <Checkbox
                id="delete-download-file"
                checked={deleteFile()}
                onChange={(checked) => setDeleteFile(checked)}
              />
              <Label for="delete-download-file" class="cursor-pointer">
                <div>
                  <div class="font-medium">同时删除本地下载文件</div>
                  <div class="text-sm text-muted-foreground">
                    删除下载目录中的音频文件（及同名歌词）；不勾选则仅移除列表记录。
                  </div>
                </div>
              </Label>
            </div>
            <div class="flex items-center space-x-2">
              <Checkbox
                id="remember-delete-download"
                checked={remember()}
                onChange={(checked) => setRemember(checked)}
              />
              <Label for="remember-delete-download" class="cursor-pointer">
                <div>
                  <div class="font-medium">记住我的选择</div>
                  <div class="text-sm text-muted-foreground">
                    下次移除下载记录时默认使用相同设置。可在「音乐设置 → 下载」中修改。
                  </div>
                </div>
              </Label>
            </div>
          </AppDialogScrollBody>
        </Show>
        <AppDialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            移除
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

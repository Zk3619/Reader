/**
 * 下载模块：删除任务确认（可选删本地文件 + 记住选择）
 */

import { createEffect, createSignal, Show } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogScrollBody,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { appDialogScrollBodySpaceY4 } from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import type { DownloadTask } from '@/lib/download';
import { isTauri } from '@/lib/platform/detect';

export interface DeleteDownloadHubTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: DownloadTask | null;
  onConfirm: (deleteFile: boolean) => void;
}

export function DeleteDownloadHubTaskDialog(props: DeleteDownloadHubTaskDialogProps) {
  const [deleteFile, setDeleteFile] = createSignal(false);
  const [remember, setRemember] = createSignal(
    settingsStore.state.app.rememberDeleteDownloadHubFileAction ?? false,
  );

  const fileMissing = () => Boolean(props.task?.fileMissing);
  const canDeleteFile = () =>
    isTauri() &&
    !fileMissing() &&
    Boolean(props.task?.filepath?.trim()) &&
    !props.task!.filepath.endsWith('.part');

  const titleName = () => props.task?.title?.trim() || props.task?.url || '该任务';

  createEffect(() => {
    if (!props.open || !props.task) return;
    const app = settingsStore.state.app;
    const remembered =
      app.rememberDeleteDownloadHubFileAction &&
      app.deleteDownloadHubFileAction !== undefined
        ? app.deleteDownloadHubFileAction
        : false;
    setDeleteFile(canDeleteFile() ? remembered : false);
    setRemember(app.rememberDeleteDownloadHubFileAction ?? false);
  });

  const handleConfirm = () => {
    const shouldDelete = canDeleteFile() && deleteFile();
    props.onConfirm(shouldDelete);
    if (canDeleteFile()) {
      void settingsStore.setDeleteDownloadHubFileAction(deleteFile(), remember());
    }
    props.onOpenChange(false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>删除下载任务</AppDialogTitle>
          <AppDialogDescription>
            <Show
              when={fileMissing()}
              fallback={<>确定删除「{titleName()}」吗？</>}
            >
              「{titleName()}」的本地文件已不存在或路径已变更，将仅删除下载记录。
            </Show>
          </AppDialogDescription>
        </AppDialogHeader>
        <Show when={canDeleteFile()}>
          <AppDialogScrollBody class={appDialogScrollBodySpaceY4}>
            <div class="flex items-center space-x-2">
              <Checkbox
                id="delete-download-hub-file"
                checked={deleteFile()}
                onChange={(checked) => setDeleteFile(checked)}
              />
              <Label for="delete-download-hub-file" class="cursor-pointer">
                <div>
                  <div class="font-medium">同时删除本地文件</div>
                  <div class="text-sm text-muted-foreground">
                    删除下载目录中的目标文件及未完成的 .part；不勾选则仅移除任务记录。
                  </div>
                </div>
              </Label>
            </div>
            <div class="flex items-center space-x-2">
              <Checkbox
                id="remember-delete-download-hub"
                checked={remember()}
                onChange={(checked) => setRemember(checked)}
              />
              <Label for="remember-delete-download-hub" class="cursor-pointer">
                <div>
                  <div class="font-medium">记住我的选择</div>
                  <div class="text-sm text-muted-foreground">
                    下次删除任务时默认使用相同设置。可在「下载设置 → 记住的选择」中修改。
                  </div>
                </div>
              </Label>
            </div>
          </AppDialogScrollBody>
        </Show>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            删除
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

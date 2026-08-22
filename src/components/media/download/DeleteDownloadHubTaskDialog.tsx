/**
 * 下载模块：删除任务 / 批量删除 / 清空记录确认（可选删本地文件 + 记住选择）
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

export type DeleteDownloadHubMode = 'single' | 'batch' | 'clear';

/** 正在下载 / 已暂停：使用独立的删文件记住偏好 */
export function taskIsInProgressDownload(task: DownloadTask | null | undefined): boolean {
  if (!task) return false;
  return task.state === 'running' || task.state === 'paused';
}

export function taskCanDeleteLocalFile(task: DownloadTask | null | undefined): boolean {
  if (!task || !isTauri() || task.fileMissing) return false;
  const parts = Array.isArray(task.meta.pendingParts)
    ? task.meta.pendingParts.filter((p) => String(p || '').trim())
    : [];
  if (task.state === 'needs_postprocess' && parts.length > 0) return true;
  if (String(task.meta.workDir || '').trim()) return true;
  // 有目标路径即可删：进行中/暂停/出错也可能留下 .part、分轨目录等临时文件
  return Boolean(task.filepath?.trim());
}

export interface DeleteDownloadHubTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: DeleteDownloadHubMode;
  /** mode=single */
  task?: DownloadTask | null;
  /** mode=batch | clear */
  count?: number;
  /** mode=batch | clear：是否至少有一条可删本地文件 */
  canDeleteFile?: boolean;
  /** mode=batch | clear：是否按「进行中/已暂停」记住偏好处理 */
  inProgress?: boolean;
  onConfirm: (deleteFile: boolean) => void;
}

export function DeleteDownloadHubTaskDialog(props: DeleteDownloadHubTaskDialogProps) {
  const [deleteFile, setDeleteFile] = createSignal(false);
  const [remember, setRemember] = createSignal(false);
  const [dontAskAgain, setDontAskAgain] = createSignal(false);

  const mode = () => props.mode ?? 'single';
  const fileMissing = () => Boolean(props.task?.fileMissing);
  const inProgress = () => {
    if (mode() === 'single') return taskIsInProgressDownload(props.task);
    return Boolean(props.inProgress);
  };
  const canDeleteFile = () => {
    if (mode() === 'single') return taskCanDeleteLocalFile(props.task);
    return Boolean(props.canDeleteFile) && isTauri();
  };
  /** 无可删本地文件：仅删记录，可勾选「不再提示」 */
  const recordOnly = () => !canDeleteFile();

  const titleName = () => props.task?.title?.trim() || props.task?.url || '该任务';
  const count = () => Math.max(0, props.count ?? 0);

  const dialogTitle = () => {
    if (mode() === 'clear') return '清空下载记录';
    if (mode() === 'batch') return '删除所选任务';
    if (inProgress()) {
      return props.task?.state === 'paused' ? '删除已暂停的任务' : '删除正在下载的任务';
    }
    return '删除下载任务';
  };

  createEffect(() => {
    if (!props.open) return;
    if (mode() === 'single' && !props.task) return;
    const app = settingsStore.state.app;
    if (inProgress()) {
      const remembered =
        app.rememberDeleteDownloadHubInProgressFileAction &&
        app.deleteDownloadHubInProgressFileAction !== undefined
          ? app.deleteDownloadHubInProgressFileAction
          : false;
      setDeleteFile(canDeleteFile() ? remembered : false);
      setRemember(app.rememberDeleteDownloadHubInProgressFileAction ?? false);
    } else {
      const remembered =
        app.rememberDeleteDownloadHubFileAction &&
        app.deleteDownloadHubFileAction !== undefined
          ? app.deleteDownloadHubFileAction
          : false;
      setDeleteFile(canDeleteFile() ? remembered : false);
      setRemember(app.rememberDeleteDownloadHubFileAction ?? false);
    }
    setDontAskAgain(false);
  });

  const handleConfirm = () => {
    const shouldDelete = canDeleteFile() && deleteFile();
    props.onConfirm(shouldDelete);
    if (canDeleteFile()) {
      if (inProgress()) {
        void settingsStore.setDeleteDownloadHubInProgressFileAction(deleteFile(), remember());
      } else {
        void settingsStore.setDeleteDownloadHubFileAction(deleteFile(), remember());
      }
    } else if (dontAskAgain()) {
      void settingsStore.setSkipConfirmDeleteDownloadHubNoFile(true);
    }
    props.onOpenChange(false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>{dialogTitle()}</AppDialogTitle>
          <AppDialogDescription>
            <Show when={mode() === 'clear'}>
              将清除全部 {count()} 条下载任务记录。此操作不可撤销。
            </Show>
            <Show when={mode() === 'batch'}>
              <Show
                when={inProgress()}
                fallback={<>确定删除选中的 {count()} 个任务吗？</>}
              >
                选中的 {count()} 个任务正在下载或已暂停，确定删除吗？未完成的进度将丢失。
              </Show>
            </Show>
            <Show when={mode() === 'single'}>
              <Show
                when={fileMissing()}
                fallback={
                  <Show
                    when={inProgress()}
                    fallback={<>确定删除「{titleName()}」吗？</>}
                  >
                    「{titleName()}」
                    {props.task?.state === 'paused' ? '已暂停' : '正在下载'}
                    ，确定删除吗？未完成的进度将丢失。
                  </Show>
                }
              >
                「{titleName()}」的本地文件已不存在或路径已变更，将仅删除下载记录。
              </Show>
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
                    {inProgress()
                      ? '删除未完成的临时文件、分轨及独立下载目录；不勾选则仅移除任务记录。'
                      : '删除成片、待合并分轨、独立分轨目录及未完成的 .part；不勾选则仅移除任务记录。'}
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
                    {inProgress()
                      ? '下次删除进行中/已暂停任务时默认使用相同设置。可在「下载设置 → 记住的选择」中修改。'
                      : '下次删除任务时默认使用相同设置。可在「下载设置 → 记住的选择」中修改。'}
                  </div>
                </div>
              </Label>
            </div>
          </AppDialogScrollBody>
        </Show>
        <Show when={recordOnly()}>
          <AppDialogScrollBody class={appDialogScrollBodySpaceY4}>
            <div class="flex items-center space-x-2">
              <Checkbox
                id="skip-confirm-delete-download-hub-no-file"
                checked={dontAskAgain()}
                onChange={(checked) => setDontAskAgain(checked)}
              />
              <Label for="skip-confirm-delete-download-hub-no-file" class="cursor-pointer">
                <div>
                  <div class="font-medium">不再提示</div>
                  <div class="text-sm text-muted-foreground">
                    下次删除无本地文件的任务时将直接移除记录。可在「下载设置 → 记住的选择」中恢复提示。
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
            {mode() === 'clear' ? '清空' : '删除'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

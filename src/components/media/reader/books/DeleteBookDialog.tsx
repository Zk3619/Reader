import { appDialogScrollBodySpaceY4 } from '@/lib/ui/viewport-classes';
/**
 * 删除书籍确认对话框
 * 询问用户是否删除本地文件，并允许记住选择
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
import {
  defaultDeleteStoredFileForLocalBook,
  deleteStoredFileCheckboxHint,
  deleteStoredFileCheckboxLabel,
  isLocalBook,
} from '@/lib/local-book';
import type { Book } from '@/types';

export interface DeleteBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  onConfirm: (deleteFile: boolean) => void;
}

export function DeleteBookDialog(props: DeleteBookDialogProps) {
  const [deleteFile, setDeleteFile] = createSignal(false);
  const [remember, setRemember] = createSignal(
    settingsStore.state.app.rememberDeleteFileAction ?? false
  );

  const isLocal = () => props.book && isLocalBook(props.book);

  createEffect(() => {
    if (!props.open || !props.book) return;
    const app = settingsStore.state.app;
    const remembered =
      app.rememberDeleteFileAction && app.deleteFileAction !== undefined
        ? app.deleteFileAction
        : undefined;
    setDeleteFile(
      defaultDeleteStoredFileForLocalBook(props.book.bookUrl, remembered),
    );
    setRemember(app.rememberDeleteFileAction ?? false);
  });

  const handleConfirm = () => {
    props.onConfirm(deleteFile());
    if (isLocal()) {
      void settingsStore.setDeleteFileAction(deleteFile(), remember());
    }
    props.onOpenChange(false);
    // 重置状态
    setDeleteFile(false);
    setRemember(settingsStore.state.app.rememberDeleteFileAction ?? false);
  };

  const handleCancel = () => {
    props.onOpenChange(false);
    // 重置状态
    setDeleteFile(false);
    setRemember(settingsStore.state.app.rememberDeleteFileAction ?? false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>删除书籍</AppDialogTitle>
          <AppDialogDescription>确定删除《{props.book?.name}》吗？</AppDialogDescription>
        </AppDialogHeader>
        <Show when={isLocal()}>
          <AppDialogScrollBody class={appDialogScrollBodySpaceY4}>
            <div class="flex items-center space-x-2">
              <Checkbox
                id="delete-file"
                checked={deleteFile()}
                onChange={(checked) => setDeleteFile(checked)}
              />
              <Label for="delete-file" class="cursor-pointer">
                <div>
                  <div class="font-medium">
                    {deleteStoredFileCheckboxLabel(props.book!.bookUrl)}
                  </div>
                  <div class="text-sm text-muted-foreground">
                    {deleteStoredFileCheckboxHint(props.book!.bookUrl)}
                  </div>
                </div>
              </Label>
            </div>
            <div class="flex items-center space-x-2">
              <Checkbox
                id="remember-delete"
                checked={remember()}
                onChange={(checked) => setRemember(checked)}
              />
              <Label for="remember-delete" class="cursor-pointer">
                <div>
                  <div class="font-medium">记住我的选择</div>
                  <div class="text-sm text-muted-foreground">
                    下次删除书籍时使用相同设置。可在「阅读设置」或「主设置 → 存储 → 记住的选择」中修改。
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
            删除
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

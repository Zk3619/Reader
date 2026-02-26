/**
 * 删除书籍确认对话框
 * 询问用户是否删除本地文件，并允许记住选择
 */

import { createSignal, Show } from 'solid-js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { settingsStore } from '@/stores/settings';
import { isLocalBook } from '@/lib/local-book';
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

  const handleConfirm = () => {
    props.onConfirm(deleteFile());
    if (remember()) {
      settingsStore.setDeleteFileAction(deleteFile(), true);
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>删除书籍</DialogTitle>
          <DialogDescription class="pt-2">
            确定删除《{props.book?.name}》吗？
          </DialogDescription>
        </DialogHeader>
        <Show when={isLocal()}>
          <div class="py-4 space-y-4">
            <div class="flex items-center space-x-2">
              <Checkbox
                id="delete-file"
                checked={deleteFile()}
                onChange={(checked) => setDeleteFile(checked)}
              />
              <Label for="delete-file" class="cursor-pointer">
                <div>
                  <div class="font-medium">同时删除本地文件</div>
                  <div class="text-sm text-muted-foreground">
                    删除书籍时，同时删除本地存储的书籍文件。
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
                    下次删除书籍时使用相同设置。你也可以前往设置页面修改此选项。
                  </div>
                </div>
              </Label>
            </div>
          </div>
        </Show>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

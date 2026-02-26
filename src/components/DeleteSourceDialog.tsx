/**
 * 删除书源确认对话框
 * 与书架删除书籍一致：确认后删除并提示
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { BookSource } from '@/types';

export interface DeleteSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: BookSource | null;
  onConfirm: () => void;
}

export function DeleteSourceDialog(props: DeleteSourceDialogProps) {
  const handleConfirm = () => {
    props.onConfirm();
    props.onOpenChange(false);
  };

  const handleCancel = () => {
    props.onOpenChange(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>删除书源</DialogTitle>
          <DialogDescription class="pt-2">
            确定删除书源「{props.source?.sourceName ?? ''}」吗？删除后无法恢复。
          </DialogDescription>
        </DialogHeader>
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

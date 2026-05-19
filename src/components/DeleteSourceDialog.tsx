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
import { dialogViewportLimits } from '@/lib/viewport-classes';
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
      <DialogContent class={`${dialogViewportLimits} flex flex-col overflow-hidden p-0`}>
        <DialogHeader class="shrink-0 px-6 pt-6">
          <DialogTitle>删除书源</DialogTitle>
          <DialogDescription>
            确定删除书源「{props.source?.sourceName ?? ''}」吗？删除后无法恢复。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="shrink-0 flex-row justify-end gap-2 border-t border-border/50 bg-background px-6 py-4">
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

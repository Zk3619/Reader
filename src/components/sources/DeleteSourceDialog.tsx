/**
 * 删除书源确认对话框
 * 与书架删除书籍一致：确认后删除并提示
 */

import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
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
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>删除书源</AppDialogTitle>
          <AppDialogDescription>
            确定删除书源「{props.source?.sourceName ?? ''}」吗？删除后无法恢复。
          </AppDialogDescription>
        </AppDialogHeader>
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

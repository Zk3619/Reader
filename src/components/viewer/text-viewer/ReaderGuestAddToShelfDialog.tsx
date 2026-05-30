import { Button } from '@/components/ui/button';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';

export interface ReaderGuestAddToShelfDialogProps {
  open: boolean;
  bookName: string;
  adding?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onDecline: () => void;
}

/** 试读结束退出阅读器时，询问是否加入书架 */
export function ReaderGuestAddToShelfDialog(props: ReaderGuestAddToShelfDialogProps) {
  const title = () => {
    const name = props.bookName.trim();
    return name ? `是否将《${name}》加入书架？` : '是否将本书加入书架？';
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent layout="plain" class="max-w-md">
        <AppDialogHeader>
          <AppDialogTitle>{title()}</AppDialogTitle>
          <AppDialogDescription>
            加入书架后可保存阅读进度，并在书架中继续阅读。
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogFooter class="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={props.adding}
            onClick={props.onDecline}
          >
            暂不加入
          </Button>
          <Button type="button" disabled={props.adding} onClick={props.onConfirm}>
            {props.adding ? '加入中…' : '加入书架'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

import { Button } from '@/components/ui/button';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';

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
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <ViewerAppDialogContent
        layout="plain"
        class="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>{title()}</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            加入书架后可保存阅读进度，并在书架中继续阅读。
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <ViewerAppDialogFooter class="gap-2 sm:justify-end">
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
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
}

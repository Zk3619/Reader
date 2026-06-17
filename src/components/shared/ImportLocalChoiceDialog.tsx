/**
 * 本地导入：选择文件或目录（书源 / 书籍等共用）
 */

import { Show } from 'solid-js';
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
import { FileTextIcon, FolderTreeIcon } from '@/components/shared/icons';

export interface ImportLocalChoiceDialogProps {
  open: boolean;
  busy?: boolean;
  title: string;
  description: string;
  fileButtonLabel?: string;
  fileButtonHint?: string;
  directoryButtonLabel?: string;
  directoryButtonHint?: string;
  onOpenChange: (open: boolean) => void;
  onPickFile: () => void;
  onPickDirectory: () => void;
  portalZClass?: string;
}

export function ImportLocalChoiceDialog(props: ImportLocalChoiceDialogProps) {
  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent portalToBody portalZClass={props.portalZClass}>
        <AppDialogHeader>
          <AppDialogTitle>{props.title}</AppDialogTitle>
          <AppDialogDescription>{props.description}</AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody>
          <div class="grid gap-3 sm:grid-cols-2">
            <Button
              variant="outline"
              class="h-auto flex-col gap-2 py-6"
              disabled={props.busy}
              onClick={() => props.onPickFile()}
            >
              <FileTextIcon class="h-8 w-8 text-muted-foreground" />
              <span class="font-medium">{props.fileButtonLabel ?? '选择文件'}</span>
              <Show when={props.fileButtonHint}>
                <span class="text-center text-xs font-normal text-muted-foreground">
                  {props.fileButtonHint}
                </span>
              </Show>
            </Button>
            <Button
              variant="outline"
              class="h-auto flex-col gap-2 py-6"
              disabled={props.busy}
              onClick={() => props.onPickDirectory()}
            >
              <FolderTreeIcon class="h-8 w-8 text-muted-foreground" />
              <span class="font-medium">{props.directoryButtonLabel ?? '选择目录'}</span>
              <Show when={props.directoryButtonHint}>
                <span class="text-center text-xs font-normal text-muted-foreground">
                  {props.directoryButtonHint}
                </span>
              </Show>
            </Button>
          </div>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.busy}>
            取消
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

/**
 * 导入操作选择对话框
 * 每次导入本地书籍时让用户选择复制或移动操作
 */

import { createSignal, createEffect } from 'solid-js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { settingsStore } from '@/stores/settings';
import { dialogViewportLimits } from '@/lib/viewport-classes';

export type ImportAction = 'copy' | 'move';

export interface ImportActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (action: ImportAction, remember: boolean) => void;
}

export function ImportActionDialog(props: ImportActionDialogProps) {
  const [action, setAction] = createSignal<ImportAction>(
    settingsStore.state.app.importBookAction || 'copy'
  );
  const [remember, setRemember] = createSignal(
    settingsStore.state.app.rememberImportAction || false
  );

  // 每次打开时从 store 同步，避免显示上次未确认的选择
  createEffect(() => {
    if (props.open) {
      setAction(settingsStore.state.app.importBookAction || 'copy');
      setRemember(settingsStore.state.app.rememberImportAction || false);
    }
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setAction(settingsStore.state.app.importBookAction || 'copy');
      setRemember(settingsStore.state.app.rememberImportAction || false);
    }
    props.onOpenChange(open);
  };

  const handleConfirm = () => {
    props.onConfirm(action(), remember());
    if (remember()) {
      settingsStore.setImportBookAction(action(), true);
    }
    props.onOpenChange(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent class={`${dialogViewportLimits} flex flex-col overflow-hidden p-0`}>
        <DialogHeader class="shrink-0 px-6 pt-6">
          <DialogTitle>选择书籍存放方式</DialogTitle>
          <DialogDescription>请选择导入书籍时的操作方式</DialogDescription>
        </DialogHeader>
        <div class="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <RadioGroup value={action()} onChange={(value) => setAction(value as ImportAction)}>
            <RadioGroupItem value="copy" class="py-2">
              <RadioGroupItemLabel class="flex-1 cursor-pointer">
                <div>
                  <div class="font-medium">复制</div>
                  <div class="text-sm text-muted-foreground">
                    将书籍文件复制到指定目录，保留原文件
                  </div>
                </div>
              </RadioGroupItemLabel>
            </RadioGroupItem>
            <RadioGroupItem value="move" class="py-2">
              <RadioGroupItemLabel class="flex-1 cursor-pointer">
                <div>
                  <div class="font-medium">移动</div>
                  <div class="text-sm text-muted-foreground">
                    将书籍文件移动到指定目录，删除原文件
                  </div>
                </div>
              </RadioGroupItemLabel>
            </RadioGroupItem>
          </RadioGroup>
          <div class="flex items-center space-x-2">
            <Checkbox
              id="remember-action"
              checked={remember()}
              onChange={(checked) => setRemember(checked)}
            />
            <Label for="remember-action" class="cursor-pointer text-sm">
              记住我的选择
            </Label>
          </div>
        </div>
        <DialogFooter class="shrink-0 flex-row justify-end gap-2 border-t border-border/50 bg-background px-6 py-4">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button variant="default" onClick={handleConfirm}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

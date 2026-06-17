import { appDialogScrollBodySpaceY4 } from '@/lib/ui/viewport-classes';
/**
 * 导入操作选择对话框
 * 每次导入本地书籍时让用户选择复制、移动或无动作
 */

import { createSignal, createEffect, createResource } from 'solid-js';
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
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { settingsStore } from '@/stores/settings';
import { isTauri } from '@/lib/platform/detect';
import { usesDirectoryHandleBooksRoot } from '@/lib/platform/fs/managed-storage';
import type { ImportBookAction } from '@/lib/local-book/import';

export type ImportAction = ImportBookAction;

export interface ImportActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (action: ImportAction, remember: boolean) => void;
}

function defaultAction(): ImportAction {
  return settingsStore.state.app.importBookAction || 'copy';
}

export function ImportActionDialog(props: ImportActionDialogProps) {
  const [webUsesUserFolder] = createResource(
    () => props.open && !isTauri(),
    async (shouldLoad) => (shouldLoad ? await usesDirectoryHandleBooksRoot() : false),
  );

  const [action, setAction] = createSignal<ImportAction>(defaultAction());
  const [remember, setRemember] = createSignal(
    settingsStore.state.app.rememberImportAction || false,
  );

  createEffect(() => {
    if (props.open) {
      setAction(defaultAction());
      setRemember(settingsStore.state.app.rememberImportAction || false);
    }
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setAction(defaultAction());
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
    <AppDialog open={props.open} onOpenChange={handleOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>选择书籍存放方式</AppDialogTitle>
          <AppDialogDescription>
            {webUsesUserFolder()
              ? '可将书籍写入指定文件夹，或仅登记原文件位置（无动作）。浏览器无法移动磁盘上的原文件；选「移动」表示写入书籍库后释放本次选择的文件句柄。'
              : '请选择导入书籍时的操作方式。选「无动作」时书架将直接引用所选文件，不复制到书籍库目录。'}
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody class={appDialogScrollBodySpaceY4}>
          <RadioGroup value={action()} onChange={(value) => setAction(value as ImportAction)}>
            <RadioGroupItem value="copy" class="py-2">
              <RadioGroupItemLabel class="flex-1 cursor-pointer">
                <div>
                  <div class="font-medium">复制</div>
                  <div class="text-sm text-muted-foreground">
                    将书籍文件复制到书籍库目录，保留原文件
                  </div>
                </div>
              </RadioGroupItemLabel>
            </RadioGroupItem>
            <RadioGroupItem value="move" class="py-2">
              <RadioGroupItemLabel class="flex-1 cursor-pointer">
                <div>
                  <div class="font-medium">移动</div>
                  <div class="text-sm text-muted-foreground">
                    {isTauri()
                      ? '将书籍文件移动到书籍库目录，删除原文件'
                      : '将书籍写入书籍库目录，并释放本次选择的文件句柄'}
                  </div>
                </div>
              </RadioGroupItemLabel>
            </RadioGroupItem>
            <RadioGroupItem value="none" class="py-2">
              <RadioGroupItemLabel class="flex-1 cursor-pointer">
                <div>
                  <div class="font-medium">无动作</div>
                  <div class="text-sm text-muted-foreground">
                    不写入书籍库目录，书架直接引用当前文件位置（移动或删除原文件后可能无法阅读）
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
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button variant="default" onClick={handleConfirm}>
            确定
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

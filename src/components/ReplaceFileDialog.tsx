/**
 * 文件替换确认对话框
 * 当导入的书籍文件已存在时，询问用户是否替换
 */

import { createSignal, Show, createEffect} from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/AppDialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { settingsStore } from '@/stores/settings';

export type ReplaceFileAction = 'replace' | 'skip' | 'restore-existing' | 'rename-import' | 'cancel';

export interface ReplaceFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  isSameSize?: boolean; // 文件大小是否相同
  isSameContent?: boolean; // 文件内容是否相同（通过哈希比较）
  onConfirm: (action: ReplaceFileAction, remember: boolean) => void;
}

export function ReplaceFileDialog(props: ReplaceFileDialogProps) {
  // 如果文件大小和内容都相同，默认选中"恢复已存在的书籍"
  const getDefaultAction = (): ReplaceFileAction => {
    if (props.isSameSize && props.isSameContent) {
      return 'restore-existing';
    }
    return settingsStore.state.app.replaceExistingFile || 'replace';
  };

  const [action, setAction] = createSignal<ReplaceFileAction>(getDefaultAction());
  const [remember, setRemember] = createSignal(
    settingsStore.state.app.rememberReplaceFile || false
  );

  // 当对话框打开时，重新设置默认值
  createEffect(() => {
    if (props.open) {
      setAction(getDefaultAction());
      setRemember(settingsStore.state.app.rememberReplaceFile || false);
    }
  });

  const handleConfirm = () => {
    const selectedAction = action();
    if (selectedAction === 'cancel') {
      props.onConfirm('cancel', false);
    } else {
      props.onConfirm(selectedAction, remember());
      if (remember()) {
        settingsStore.setReplaceFileAction(selectedAction, true);
      }
    }
    props.onOpenChange(false);
    // 重置状态
    setAction(settingsStore.state.app.replaceExistingFile || 'replace');
    setRemember(settingsStore.state.app.rememberReplaceFile || false);
  };

  const handleCancel = () => {
    props.onConfirm('cancel', false);
    props.onOpenChange(false);
    // 重置状态
    setAction(settingsStore.state.app.replaceExistingFile || 'replace');
    setRemember(settingsStore.state.app.rememberReplaceFile || false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>文件已存在</AppDialogTitle>
          <AppDialogDescription>
            文件《{props.fileName}》已存在于书籍目录中，请选择操作方式。
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <RadioGroup value={action()} onChange={(value) => setAction(value as ReplaceFileAction)}>
            <Show when={props.isSameSize && props.isSameContent}>
              {/* 文件大小和内容都相同：确定是同一文件，提供恢复选项 */}
              <RadioGroupItem value="restore-existing" class="py-2">
                <RadioGroupItemLabel class="flex-1 cursor-pointer">
                  <div>
                    <div class="font-medium">恢复已存在的书籍</div>
                    <div class="text-sm text-muted-foreground">
                      文件大小和内容完全一致，确定是同一文件。恢复书籍记录到书架，不替换文件。
                    </div>
                  </div>
                </RadioGroupItemLabel>
              </RadioGroupItem>
            </Show>
            <Show when={props.isSameSize && !props.isSameContent}>
              {/* 文件大小相同但内容不同：警告用户 */}
              <div class="mb-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-warning-foreground">
                <div class="font-medium">⚠️ 注意：文件大小相同但内容不同</div>
                <div class="mt-1 text-xs opacity-90">
                  文件名和大小相同，但文件内容不一致。建议选择"替换原文件"或"重命名导入"以避免数据丢失。
                </div>
              </div>
            </Show>
            <Show when={!props.isSameSize || !props.isSameContent}>
              {/* 文件大小不同或内容不同：提供替换和重命名选项 */}
              <RadioGroupItem value="replace" class="py-2">
                <RadioGroupItemLabel class="flex-1 cursor-pointer">
                  <div>
                    <div class="font-medium">替换原文件</div>
                    <div class="text-sm text-muted-foreground">
                      {props.isSameSize 
                        ? "用新文件替换已存在的文件（文件大小相同但内容不同）"
                        : "用新文件替换已存在的文件（文件大小不同，内容可能不同）"}
                    </div>
                  </div>
                </RadioGroupItemLabel>
              </RadioGroupItem>
              <RadioGroupItem value="rename-import" class="py-2">
                <RadioGroupItemLabel class="flex-1 cursor-pointer">
                  <div>
                    <div class="font-medium">重命名导入</div>
                    <div class="text-sm text-muted-foreground">
                      保留原文件，使用新文件名导入新文件                    </div>
                  </div>
                </RadioGroupItemLabel>
              </RadioGroupItem>
            </Show>
            <RadioGroupItem value="skip" class="py-2">
              <RadioGroupItemLabel class="flex-1 cursor-pointer">
                <div>
                  <div class="font-medium">跳过导入</div>
                  <div class="text-sm text-muted-foreground">
                    保留原文件，不导入新文件
                  </div>
                </div>
              </RadioGroupItemLabel>
            </RadioGroupItem>
          </RadioGroup>
          <div class="flex items-center space-x-2">
          <Checkbox
            id="remember-replace"
            checked={remember()}
            onChange={(checked) => setRemember(checked)}
          />
          <Label for="remember-replace" class="cursor-pointer">
            <div>
              <div class="font-medium text-sm">记住我的选择</div>
              <div class="text-xs text-muted-foreground">
                下次遇到相同情况时使用相同设置。你也可以前往设置页面修改此选项。
              </div>
            </div>
          </Label>
          </div>
        </div>
        <AppDialogFooter>
          <Button variant="outline" onClick={handleCancel}>
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

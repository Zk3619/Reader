/**
 * 自定义源初始化失败弹窗（对齐 lx user_api__init_failed_alert）
 */

import { createSignal, onCleanup, onMount, type Component } from 'solid-js';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import {
  subscribeUserApiInitFailed,
  type UserApiInitFailedAlert,
} from '@/lib/media/audio/online/user-api-engine';
import { clearFocusBeforeModal } from '@/utils/accessibility';

export const UserApiInitFailedHost: Component = () => {
  const [alert, setAlert] = createSignal<UserApiInitFailedAlert | null>(null);

  const close = () => setAlert(null);

  onMount(() => {
    const unsub = subscribeUserApiInitFailed((next) => {
      clearFocusBeforeModal();
      setAlert(next);
    });
    onCleanup(unsub);
  });

  return (
    <ViewerAppDialog
      open={alert() != null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      modal={false}
    >
      <ViewerAppDialogContent class="w-[calc(100dvw-2rem)] max-w-md" layout="app">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>音源初始化失败</ViewerAppDialogTitle>
          <ViewerAppDialogDescription class="whitespace-pre-wrap wrap-break-word text-left">
            {alert()
              ? `自定义源「${alert()!.name}」初始化失败：\n${alert()!.message}`
              : ''}
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <ViewerAppDialogFooter>
          <Button onClick={close}>确定</Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};

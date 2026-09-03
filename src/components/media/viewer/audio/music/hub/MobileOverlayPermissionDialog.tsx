/**
 * 移动端悬浮窗权限：AppDialog 说明 + 跳转系统「显示在其他应用上层」设置。
 * 权限 API 目前仅 Android；不在页面内插入常驻提示条。
 */

import { createSignal, onCleanup, onMount, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import {
  checkAndroidOverlayPermission,
  registerMobileOverlayPermissionPrompt,
  requestAndroidOverlayPermission,
  supportsMobileOverlayLyric,
  waitUntilReturnedFromOverlaySettings,
} from '@/lib/media/audio/mobile-desktop-lyric';

type PromptResolve = (granted: boolean) => void;

const [dialogOpen, setDialogOpen] = createSignal(false);
let promptResolve: PromptResolve | undefined;
let hostMounted = false;
/** 跳转系统设置时关对话框，勿当成用户取消 */
let openingSystemSettings = false;

function settlePrompt(granted: boolean): void {
  const resolve = promptResolve;
  promptResolve = undefined;
  setDialogOpen(false);
  resolve?.(granted);
}

async function runInteractiveOverlayPermissionPrompt(): Promise<boolean> {
  if (!supportsMobileOverlayLyric()) return false;
  if (await checkAndroidOverlayPermission()) return true;
  if (!hostMounted) {
    await requestAndroidOverlayPermission();
    await waitUntilReturnedFromOverlaySettings();
    return checkAndroidOverlayPermission();
  }
  if (promptResolve) {
    return new Promise((resolve) => {
      const prev = promptResolve;
      promptResolve = (granted) => {
        prev?.(granted);
        resolve(granted);
      };
    });
  }
  return new Promise((resolve) => {
    promptResolve = resolve;
    setDialogOpen(true);
  });
}

export const MobileOverlayPermissionDialog: Component = () => {
  onMount(() => {
    hostMounted = true;
    registerMobileOverlayPermissionPrompt(runInteractiveOverlayPermissionPrompt);
    onCleanup(() => {
      hostMounted = false;
      registerMobileOverlayPermissionPrompt(null);
      settlePrompt(false);
    });
  });

  const closeWithoutGrant = () => {
    if (openingSystemSettings) return;
    settlePrompt(false);
  };

  const goToSystemSettings = async () => {
    openingSystemSettings = true;
    setDialogOpen(false);
    try {
      await requestAndroidOverlayPermission();
      await waitUntilReturnedFromOverlaySettings();
      settlePrompt(await checkAndroidOverlayPermission());
    } catch {
      settlePrompt(false);
    } finally {
      openingSystemSettings = false;
    }
  };

  return (
    <AppDialog
      open={dialogOpen()}
      onOpenChange={(open) => {
        if (!open) closeWithoutGrant();
      }}
    >
      <AppDialogContent class="sm:max-w-sm" portalToBody>
        <AppDialogHeader>
          <AppDialogTitle>需要悬浮窗权限</AppDialogTitle>
          <AppDialogDescription>
            悬浮歌词会显示在其他应用上层，需要系统「显示在其他应用上层」权限。
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogFooter>
          <Button type="button" variant="outline" onClick={closeWithoutGrant}>
            取消
          </Button>
          <Button type="button" onClick={() => void goToSystemSettings()}>
            去设置
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
};

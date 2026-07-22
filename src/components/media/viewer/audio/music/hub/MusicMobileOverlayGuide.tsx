/**
 * Android 悬浮窗权限引导（桌面歌词 / 迷你播放相关能力）
 */

import { createSignal, onMount, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { isAndroid, isTauri } from '@/lib/platform/detect';
import {
  checkAndroidOverlayPermission,
  requestAndroidOverlayPermission,
} from '@/lib/media/audio/android-desktop-lyric';

export const MusicMobileOverlayGuide: Component = () => {
  const [granted, setGranted] = createSignal(true);
  const [dismissed, setDismissed] = createSignal(false);

  onMount(() => {
    if (!isTauri() || !isAndroid()) return;
    void checkAndroidOverlayPermission()
      .then(setGranted)
      .catch(() => setGranted(false));
  });

  return (
    <Show when={isTauri() && isAndroid() && !granted() && !dismissed()}>
      <div class="mx-3 mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
        <p class="font-medium text-amber-900 dark:text-amber-100">需要悬浮窗权限</p>
        <p class="mt-1 text-xs text-muted-foreground">
          桌面歌词等浮动能力需要「显示在其他应用上层」权限。请在系统设置中授权。
        </p>
        <div class="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void requestAndroidOverlayPermission().then(() =>
                checkAndroidOverlayPermission().then(setGranted),
              )
            }
          >
            申请权限
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            稍后
          </Button>
        </div>
      </div>
    </Show>
  );
};

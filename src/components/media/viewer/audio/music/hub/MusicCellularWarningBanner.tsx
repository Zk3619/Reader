/**
 * Hub 内蜂窝网络提示条
 */

import { createSignal, onCleanup, onMount, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import {
  isCellularNetwork,
  subscribeNetworkKind,
} from '@/lib/platform/network';
import { isMobile, isAndroid } from '@/lib/platform/detect';

export const MusicCellularWarningBanner: Component = () => {
  const [dismissed, setDismissed] = createSignal(false);
  const [rev, setRev] = createSignal(0);

  onMount(() => {
    const unsub = subscribeNetworkKind(() => setRev((v) => v + 1));
    onCleanup(unsub);
  });

  const show = () => {
    rev();
    if (dismissed()) return false;
    if (!isMobile() && !isAndroid()) return false;
    if (!isCellularNetwork()) return false;
    const s = getMusicSettings();
    return !s.useCellularNetworkPlay || !s.useCellularNetworkDownload;
  };

  return (
    <Show when={show()}>
      <div class="mx-3 mb-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm">
        <p class="font-medium text-sky-900 dark:text-sky-100">当前为移动网络</p>
        <p class="mt-1 text-xs text-muted-foreground">
          在线播放与下载可能已被限制。可在播放设置中允许使用移动网络。
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setMusicSettings({
                useCellularNetworkPlay: true,
                useCellularNetworkDownload: true,
              })
            }
          >
            允许本次使用
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            知道了
          </Button>
        </div>
      </div>
    </Show>
  );
};

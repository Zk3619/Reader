import { isTauri } from '@/lib/platform/detect';

type WakeLockSentinelLike = {
  release(): Promise<void>;
};

let wakeLock: WakeLockSentinelLike | null = null;

/** 播放时阻止系统进入休眠；关闭或停止播放时释放。 */
export async function setMusicPlaybackSleepBlocked(blocked: boolean): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_music_sleep_blocked', { blocked });
      return;
    } catch {
      // Web fallback below.
    }
  }

  if (!blocked) {
    await wakeLock?.release().catch(() => undefined);
    wakeLock = null;
    return;
  }
  if (wakeLock || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  try {
    const manager = navigator.wakeLock as {
      request(type: 'screen'): Promise<WakeLockSentinelLike>;
    };
    wakeLock = await manager.request('screen');
  } catch {
    // 浏览器可能因页面不可见或权限策略拒绝。
  }
}

/** 更新桌面任务栏进度；Web 与移动端静默降级。 */
export async function setMusicTaskbarProgress(options: {
  enabled: boolean;
  playing: boolean;
  hasError: boolean;
  position: number;
  duration: number;
}): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow, ProgressBarStatus } = await import('@tauri-apps/api/window');
    if (!options.enabled || options.duration <= 0) {
      await getCurrentWindow().setProgressBar({ status: ProgressBarStatus.None });
      return;
    }
    const ratio = Math.max(0, Math.min(1, options.position / options.duration));
    await getCurrentWindow().setProgressBar({
      status: options.hasError
        ? ProgressBarStatus.Error
        : options.playing
          ? ProgressBarStatus.Normal
          : ProgressBarStatus.Paused,
      progress: Math.round(ratio * 100),
    });
  } catch {
    // 当前桌面环境不支持任务栏进度时静默降级。
  }
}

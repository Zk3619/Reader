import type { MusicPlayTimerAction } from '@/lib/media/audio/music-settings';
import { isTauri } from '@/lib/platform/detect';

export const MUSIC_PLAY_TIMER_ACTIONS: readonly MusicPlayTimerAction[] = [
  'pause',
  'stop-after-track',
  'exit-after-track',
  'shutdown-after-track',
];

export const MUSIC_PLAY_TIMER_ACTION_LABELS: Record<MusicPlayTimerAction, string> = {
  pause: '暂停播放',
  'stop-after-track': '当前歌曲播放完毕后停止',
  'exit-after-track': '当前歌曲播放完毕后退出程序',
  'shutdown-after-track': '当前歌曲播放完毕后关机',
};

export async function executeMusicPlayTimerSystemAction(
  action: Extract<MusicPlayTimerAction, 'exit-after-track' | 'shutdown-after-track'>,
): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke(action === 'exit-after-track' ? 'request_app_exit' : 'shutdown_system');
}

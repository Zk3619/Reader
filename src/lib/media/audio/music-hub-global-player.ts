/**
 * 音乐 Hub 与主壳全局播放窗的同步策略。
 *
 * 仅在真正播放时占用全局窗；进入模块未起播、或已暂停时切走其它模块不应出现播放条。
 * 切歌取链中 playing 可能短暂为 false：已挂上的窗保持，避免闪断。
 */

export type MusicHubGlobalPlayerSyncInput = {
  enabled: boolean;
  hasTrack: boolean;
  playing: boolean;
  loading: boolean;
};

export type MusicHubGlobalPlayerSyncAction = 'activate' | 'clear' | 'keep';

export function resolveMusicHubGlobalPlayerSync(
  input: MusicHubGlobalPlayerSyncInput,
): MusicHubGlobalPlayerSyncAction {
  if (!input.enabled || !input.hasTrack) return 'clear';
  if (input.playing) return 'activate';
  if (input.loading) return 'keep';
  return 'clear';
}

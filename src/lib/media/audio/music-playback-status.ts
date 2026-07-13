/**
 * 音乐播放状态文案（对齐 lx-music i18n：player__getting_url / toggle_source_*）
 */

export const MusicPlaybackStatusText = {
  gettingUrl: '正在获取歌曲链接…',
  toggleTry: '尝试切换到其他来源…',
  toggleFailed:
    '换源失败，请尝试手动在搜索页指定其他来源搜索该歌曲播放',
} as const;

const SOURCE_LABELS: Record<string, string> = {
  kw: '酷我',
  wy: '网易',
  kg: '酷狗',
  tx: 'QQ音乐',
  mg: '咪咕',
  bili: '哔哩',
};

export function formatToggleSourceTry(track: { source: string; name: string }): string {
  const label = SOURCE_LABELS[track.source] ?? track.source;
  return `尝试切换到${label}：${track.name}`;
}

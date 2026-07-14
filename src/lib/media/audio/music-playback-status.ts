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

/** 将 UserApi / 平台错误映射为可读文案 */
export function formatMusicUrlError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const msg = raw.trim();
  if (!msg) return '无法解析播放地址';
  if (/付费|vip|试听|会员|收费|版权|无版权|空.?purl|freeTrial|trial/i.test(msg)) {
    return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg;
  }
  if (/timeout|超时/i.test(msg)) return '获取链接超时';
  if (/block\s*ip|too many requests|封禁|频繁/i.test(msg)) {
    return '音源已封禁当前 IP（多为请求过频；可飞行模式换 IP，或暂时禁用该源）';
  }
  if (/failed|FAILED|服务器异常/i.test(msg)) {
    return '音源拒绝返回链接（多为 VIP/试听或代理失效；可登录网易会员或换可用代理源）';
  }
  return msg.length > 160 ? `${msg.slice(0, 160)}…` : msg;
}

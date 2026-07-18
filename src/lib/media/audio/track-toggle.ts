/**
 * 换源挂载信息（对齐 lx meta.toggleMusicInfo）
 * 自动换源只改取链目标，不改变列表曲目身份。
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';

export function getToggleMusicInfo(track: AudioTrack): AudioTrack | null {
  const raw = track.meta.toggleMusicInfo;
  if (!raw || typeof raw !== 'object') return null;
  const alt = raw as AudioTrack;
  if (typeof alt.id !== 'string' || !alt.id.trim()) return null;
  if (typeof alt.source !== 'string' || !alt.source.trim()) return null;
  return alt;
}

/** 保留原曲身份，挂上换源曲目供取链/补歌词/补封面 */
export function attachToggleMusicInfo(
  original: AudioTrack,
  alt: AudioTrack,
): AudioTrack {
  const coverUrl =
    (typeof original.meta.coverUrl === 'string' && original.meta.coverUrl.trim()
      ? original.meta.coverUrl
      : null) ??
    (typeof alt.meta.coverUrl === 'string' && alt.meta.coverUrl.trim()
      ? alt.meta.coverUrl
      : undefined);
  return {
    ...original,
    meta: {
      ...original.meta,
      toggleMusicInfo: alt,
      ...(coverUrl ? { coverUrl } : {}),
    },
  };
}

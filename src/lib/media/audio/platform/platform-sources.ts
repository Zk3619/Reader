/**
 * 账号态平台源（网易云 / B 站 / YTM），与 LX 五源、MF 辅源并列
 */

import type { AudioTrackSource } from '@/lib/media/audio/track-types';

export const PLATFORM_SOURCES: AudioTrackSource[] = ['netease', 'bili', 'ytm'];

export type PlatformSourceId = 'netease' | 'bili' | 'ytm';

export const PLATFORM_SOURCE_LABELS: Record<PlatformSourceId, string> = {
  netease: '网易云音乐',
  bili: '哔哩哔哩',
  ytm: 'YouTube Music',
};

export const PLATFORM_SOURCE_SHORT_LABELS: Record<PlatformSourceId, string> = {
  netease: '网易云',
  bili: 'Bili',
  ytm: 'YTM',
};

export function isPlatformSource(source: string): source is PlatformSourceId {
  return source === 'netease' || source === 'bili' || source === 'ytm';
}

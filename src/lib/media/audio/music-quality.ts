/**
 * 播放音质选择与降级
 */

import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { TRY_QUALITYS_LIST } from '@/lib/media/audio/lyric-types';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { getActiveUserApiQualitys } from '@/lib/media/audio/online/user-api-engine';

export type { MusicQuality };

export const QUALITY_LABELS: Record<MusicQuality, string> = {
  '128k': '标准 128k',
  '192k': '较高 192k',
  '320k': '高品质 320k',
  flac: '无损 FLAC',
  flac24bit: 'Hi-Res',
  ape: 'APE',
  wav: 'WAV',
};

export function getPlayQuality(): MusicQuality {
  return getMusicSettings().playQuality;
}

export function setPlayQuality(q: MusicQuality): void {
  setMusicSettings({ playQuality: q });
}

/** 当前活跃 UserApi 允许的音质（空 = 未限制，展示全量） */
export function listPlayQualityOptions(): MusicQuality[] {
  const all = Object.keys(QUALITY_LABELS) as MusicQuality[];
  const supported = getActiveUserApiQualitys();
  if (!supported.length) return all;
  const filtered = all.filter((q) => supported.includes(q));
  return filtered.length ? filtered : all;
}

/** 从用户偏好向下尝试可用音质 */
export function qualityFallbackChain(preferred: MusicQuality): MusicQuality[] {
  const idx = TRY_QUALITYS_LIST.indexOf(preferred as (typeof TRY_QUALITYS_LIST)[number]);
  if (idx >= 0) return TRY_QUALITYS_LIST.slice(idx) as MusicQuality[];
  return [preferred, ...TRY_QUALITYS_LIST.filter((q) => q !== preferred)];
}

export function wyLevelForQuality(q: MusicQuality): string {
  switch (q) {
    case 'flac24bit':
      return 'hires';
    case 'flac':
      return 'lossless';
    case '320k':
      return 'exhigh';
    case '192k':
      return 'higher';
    default:
      return 'standard';
  }
}

/** 网易 eapi `br` 参数（对齐社区 LX 音源脚本） */
export function wyBrForQuality(q: MusicQuality): number {
  switch (q) {
    case 'flac24bit':
    case 'flac':
      return 999000;
    case '320k':
      return 320000;
    case '192k':
      return 192000;
    default:
      return 128000;
  }
}

export function kwTypeForQuality(q: MusicQuality): string {
  switch (q) {
    case 'flac24bit':
    case 'flac':
      return '2000kflac';
    case '320k':
      return '320kmp3';
    default:
      return '128kmp3';
  }
}

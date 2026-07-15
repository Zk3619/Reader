/**
 * 播放音质选择与降级
 */

import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { TRY_QUALITYS_LIST } from '@/lib/media/audio/lyric-types';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { getActiveUserApiQualitys } from '@/lib/media/audio/online/user-api-engine';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export type { MusicQuality };
export type MusicQualityPreference = MusicQuality | 'lowest' | 'highest';

export const QUALITY_LABELS: Record<MusicQuality, string> = {
  '128k': '标准 128k',
  '192k': '较高 192k',
  '320k': '高品质 320k',
  flac: '无损 FLAC',
  flac24bit: 'Hi-Res',
  ape: 'APE',
  wav: 'WAV',
};

export const QUALITY_PREFERENCE_LABELS: Record<MusicQualityPreference, string> = {
  lowest: '最低音质优先',
  highest: '最高音质优先',
  ...QUALITY_LABELS,
};

const QUALITY_PRIORITY_HIGH_TO_LOW: MusicQuality[] = [
  'flac24bit',
  'flac',
  'wav',
  'ape',
  '320k',
  '192k',
  '128k',
];

export function resolvePlayQualityPreference(
  preference: MusicQualityPreference,
  available: readonly MusicQuality[],
): MusicQuality {
  const candidates = available.length > 0
    ? QUALITY_PRIORITY_HIGH_TO_LOW.filter((quality) => available.includes(quality))
    : QUALITY_PRIORITY_HIGH_TO_LOW;
  if (preference === 'highest') return candidates[0] ?? '128k';
  if (preference === 'lowest') return candidates[candidates.length - 1] ?? '128k';
  return preference;
}

export function getPlayQualityPreference(): MusicQualityPreference {
  return getMusicSettings().playQualityPreference;
}

function normalizeQualityList(values: readonly unknown[]): MusicQuality[] {
  return values.filter(
    (quality): quality is MusicQuality =>
      typeof quality === 'string' && quality in QUALITY_LABELS,
  );
}

function getTrackQualityOptions(track?: Pick<AudioTrack, 'meta'>): MusicQuality[] {
  if (!track) return [];
  if (Array.isArray(track.meta.qualitys)) {
    const qualitys = normalizeQualityList(track.meta.qualitys);
    if (qualitys.length) return qualitys;
  }
  const typed = track.meta._qualitys;
  return typed && typeof typed === 'object' && !Array.isArray(typed)
    ? normalizeQualityList(Object.keys(typed))
    : [];
}

export function getPlayQuality(track?: Pick<AudioTrack, 'meta'>): MusicQuality {
  const trackQualitys = getTrackQualityOptions(track);
  const activeSourceQualitys = normalizeQualityList(getActiveUserApiQualitys());
  return resolvePlayQualityPreference(
    getPlayQualityPreference(),
    trackQualitys.length ? trackQualitys : activeSourceQualitys,
  );
}

export function setPlayQuality(preference: MusicQualityPreference): void {
  setMusicSettings({
    playQualityPreference: preference,
    ...(preference === 'lowest' || preference === 'highest'
      ? {}
      : { playQuality: preference }),
  });
}

/** 当前活跃 UserApi 允许的音质（空 = 未限制，展示全量） */
export function listPlayQualityOptions(): MusicQuality[] {
  const all = Object.keys(QUALITY_LABELS) as MusicQuality[];
  const supported = normalizeQualityList(getActiveUserApiQualitys());
  if (!supported.length) return all;
  const filtered = all.filter((q) => supported.includes(q));
  return filtered.length ? filtered : all;
}

/** 动态策略始终显示，固定音质仍受当前活跃 UserApi 能力限制。 */
export function listPlayQualityPreferenceOptions(): MusicQualityPreference[] {
  return ['lowest', 'highest', ...listPlayQualityOptions()];
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

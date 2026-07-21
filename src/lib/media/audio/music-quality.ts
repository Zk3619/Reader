/**
 * 播放音质选择与降级
 */

import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { TRY_QUALITYS_LIST } from '@/lib/media/audio/lyric-types';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { getActiveUserApiQualitys, getUserApiSourceQualitys, resolveLxPlatformSource } from '@/lib/media/audio/online/user-api-engine';
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

/** 对齐 LX DownloadModal 文案 */
export const DOWNLOAD_QUALITY_BUTTON_LABELS: Record<MusicQuality, string> = {
  '128k': '普通 128K',
  '192k': '较高 192K',
  '320k': '高品 320K',
  flac: '无损 FLAC',
  flac24bit: '无损 FLAC Hires',
  ape: '无损 APE',
  wav: '无损 WAV',
};

export const BATCH_DOWNLOAD_QUALITIES: MusicQuality[] = [
  '128k',
  '320k',
  'flac',
  'flac24bit',
];

export interface DownloadQualityOption {
  quality: MusicQuality;
  label: string;
  sizeLabel?: string;
}

function formatQualitySizeLabel(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? trimmed.toUpperCase() : undefined;
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    if (raw < 1024) return `${raw} B`;
    if (raw < 1024 * 1024) return `${(raw / 1024).toFixed(1)} KB`;
    return `${(raw / (1024 * 1024)).toFixed(2)} MB`;
  }
  return undefined;
}

function qualitySizeFromTrack(track: Pick<AudioTrack, 'meta'>, quality: MusicQuality): string | undefined {
  const map = track.meta._qualitys;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return undefined;
  const entry = (map as Record<string, unknown>)[quality];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
  return formatQualitySizeLabel((entry as { size?: unknown }).size);
}

function getSourceQualityOptions(track?: Pick<AudioTrack, 'source' | 'meta'>): MusicQuality[] {
  if (!track) return [];
  const platformSource = resolveLxPlatformSource(track as AudioTrack);
  const sourceQualitys = normalizeQualityList(getUserApiSourceQualitys(platformSource));
  if (sourceQualitys.length) return sourceQualitys;
  return normalizeQualityList(getActiveUserApiQualitys());
}

/** 单曲/批量共用的可用音质集合（曲目 meta ∩ 平台源能力） */
export function listTrackAvailableDownloadQualities(
  track?: Pick<AudioTrack, 'source' | 'meta'>,
): MusicQuality[] {
  const trackQualitys = getTrackQualityOptions(track);
  const sourceQualitys = getSourceQualityOptions(track);
  const base = sourceQualitys.length
    ? sourceQualitys
    : (Object.keys(QUALITY_LABELS) as MusicQuality[]);
  const available = trackQualitys.length
    ? trackQualitys.filter((q) => base.includes(q))
    : base;
  const ordered = QUALITY_PRIORITY_HIGH_TO_LOW.filter((q) => available.includes(q));
  return ordered.length ? ordered : available;
}

/** 单曲下载可选音质（曲目可用 ∩ 源能力）；无曲目信息时回退全量 */
export function listTrackDownloadQualityOptions(
  track?: Pick<AudioTrack, 'source' | 'meta'>,
): DownloadQualityOption[] {
  const list = listTrackAvailableDownloadQualities(track);
  return list.map((quality) => {
    const sizeLabel = track ? qualitySizeFromTrack(track, quality) : undefined;
    const base = DOWNLOAD_QUALITY_BUTTON_LABELS[quality] ?? QUALITY_LABELS[quality];
    return {
      quality,
      label: sizeLabel ? `${base} - ${sizeLabel}` : base,
      sizeLabel,
    };
  });
}

/** 批量下载音质按钮（多曲交集；空时回退固定四档） */
export function listBatchDownloadQualityOptions(
  tracks: Pick<AudioTrack, 'source' | 'meta'>[] = [],
): DownloadQualityOption[] {
  let intersection: MusicQuality[] | null = null;
  for (const track of tracks) {
    const available = listTrackAvailableDownloadQualities(track);
    if (!available.length) continue;
    intersection = intersection
      ? intersection.filter((q) => available.includes(q))
      : [...available];
  }
  const qualities =
    intersection && intersection.length > 0 ? intersection : BATCH_DOWNLOAD_QUALITIES;
  return qualities.map((quality) => ({
    quality,
    label: DOWNLOAD_QUALITY_BUTTON_LABELS[quality],
  }));
}

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

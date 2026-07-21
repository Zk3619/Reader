/**
 * 影视收藏元数据展示：站点 / 线路 / 集数 / 观看时长
 */

import * as VodConfig from '@/lib/media/tv/config/vod-config';
import type { TvKeepRow } from '@/lib/media/tv/types';

/** position/duration 存秒（Artplayer currentTime） */
export function formatTvKeepClock(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function resolveTvKeepSiteName(siteKey: string): string {
  const key = siteKey?.trim();
  if (!key) return '';
  if (key === 'local') return '本地';
  return VodConfig.getSite(key)?.name?.trim() || key;
}

/** 历史/收藏展示用的接口文案（站点名，缺省回退 siteKey） */
export function formatTvKeepSiteLabel(siteKey: string | undefined | null): string {
  const key = siteKey?.trim();
  if (!key) return '';
  return resolveTvKeepSiteName(key);
}

export function formatTvKeepFlag(flag: string | undefined | null): string {
  const f = flag?.trim();
  if (!f) return '';
  if (/^线路\s*\d+$/i.test(f) || /^line\s*\d+$/i.test(f)) return f;
  return f;
}

/** 观看集数（无总集数字段时仅展示当前集） */
export function formatTvKeepEpisode(episode: string | undefined | null): string {
  const ep = episode?.trim();
  if (!ep) return '';
  return ep;
}

export function formatTvKeepWatchTime(
  position: number | undefined | null,
  duration: number | undefined | null,
): string {
  const pos = formatTvKeepClock(position);
  const dur = formatTvKeepClock(duration);
  if (pos && dur) return `${pos} / ${dur}`;
  if (pos) return pos;
  if (dur) return dur;
  return '';
}

export interface TvKeepDisplayMeta {
  siteName: string;
  flag: string;
  episode: string;
  watchTime: string;
  /** 网格角标（兼容单条拼接） */
  badge: string;
  /** 网格多徽标：按信息拆分 */
  badges: string[];
  /** @deprecated 使用 sourceLine / playLine */
  subtitle: string;
  /** @deprecated 使用 playLine */
  progressSubtitle: string;
  /** 第 2 行：接口名 · 线路名 */
  sourceLine: string;
  /** 第 3 行：播放集数 · 播放时长/总时长 */
  playLine: string;
}

/** 收藏 / 历史列表共用的展示输入（仅用到的字段） */
export type TvTrackDisplayInput = Pick<TvKeepRow, 'siteKey'> &
  Partial<Pick<TvKeepRow, 'kind' | 'flag' | 'episode' | 'position' | 'duration'>>;

export function buildTvKeepDisplayMeta(row: TvTrackDisplayInput): TvKeepDisplayMeta {
  const siteName = formatTvKeepSiteLabel(row.siteKey);
  const flag = formatTvKeepFlag(row.flag);
  const episode = formatTvKeepEpisode(row.episode);
  const watchTime = formatTvKeepWatchTime(row.position, row.duration);

  const sourceParts: string[] = [];
  if (row.kind === 'live') sourceParts.push('直播');
  if (siteName) sourceParts.push(siteName);
  if (flag) sourceParts.push(flag);

  const playParts = [episode, watchTime].filter(Boolean);
  const sourceLine = sourceParts.join(' · ');
  const playLine = playParts.join(' · ');

  /** 网格：与标准列表一致，拆成两个徽标 */
  const badges = [sourceLine, playLine].filter(Boolean);

  return {
    siteName,
    flag,
    episode,
    watchTime,
    badge: badges.join(' · '),
    badges,
    subtitle: [sourceLine, playLine].filter(Boolean).join(' · '),
    progressSubtitle: playLine,
    sourceLine,
    playLine,
  };
}

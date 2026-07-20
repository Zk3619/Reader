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
  return VodConfig.getSite(key)?.name?.trim() || key;
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
  /** 网格角标：有则拼接 */
  badge: string;
  /** 标准列表副文案 */
  subtitle: string;
}

export function buildTvKeepDisplayMeta(row: TvKeepRow): TvKeepDisplayMeta {
  const siteName = resolveTvKeepSiteName(row.siteKey);
  const flag = formatTvKeepFlag(row.flag);
  const episode = formatTvKeepEpisode(row.episode);
  const watchTime = formatTvKeepWatchTime(row.position, row.duration);

  const parts: string[] = [];
  if (row.kind === 'live') parts.push('直播');
  if (siteName) parts.push(siteName);
  if (flag) parts.push(flag);
  if (episode) parts.push(episode);
  if (watchTime) parts.push(watchTime);

  return {
    siteName,
    flag,
    episode,
    watchTime,
    badge: parts.join(' · '),
    subtitle: parts.filter((p) => p !== '直播').join(' · '),
  };
}

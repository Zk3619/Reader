/**
 * 将 vod_play_from / vod_play_url 解析为线路与集数
 * 分隔：线路 $$$ ，集 # ，名/地址 $
 */

import type { PlayFlag, FlagEpisode } from '../types';

export function parsePlayFlags(from?: string, url?: string): PlayFlag[] {
  if (!from || !url) return [];
  const flags = from.split('$$$');
  const urls = url.split('$$$');
  const out: PlayFlag[] = [];
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]?.trim();
    if (!flag) continue;
    const raw = urls[i] ?? '';
    const episodes: FlagEpisode[] = [];
    for (const part of raw.split('#')) {
      const t = part.trim();
      if (!t) continue;
      const dollar = t.indexOf('$');
      if (dollar < 0) {
        episodes.push({ name: t, url: t });
      } else {
        episodes.push({
          name: t.slice(0, dollar) || `第${episodes.length + 1}集`,
          url: t.slice(dollar + 1),
        });
      }
    }
    out.push({ flag, episodes });
  }
  return out;
}

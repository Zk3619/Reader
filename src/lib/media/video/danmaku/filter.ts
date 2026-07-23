/**
 * 弹幕过滤（关键词 / 来源）
 */

import type { Danmu } from 'artplayer-plugin-danmuku';
import { getBangumiModulePrefs } from '@/lib/media/video/bangumi/prefs';

export function filterDanmakuList(list: Danmu[]): Danmu[] {
  const prefs = getBangumiModulePrefs();
  const kws = prefs.danmakuBlockKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
  const sources = new Set(prefs.danmakuBlockSources.map((s) => s.toLowerCase()));
  return list.filter((d) => {
    const text = String((d as { text?: string }).text ?? '').toLowerCase();
    if (kws.some((k) => text.includes(k))) return false;
    const src = String((d as { source?: string }).source ?? '').toLowerCase();
    if (src && sources.has(src)) return false;
    return true;
  });
}

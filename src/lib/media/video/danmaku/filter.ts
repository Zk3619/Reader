/**
 * 弹幕过滤（关键词 / 来源开关 / 顶底滚类型）
 * 对齐 Kazumi danmaku 来源与显示类型
 */

import type { Danmu } from 'artplayer-plugin-danmuku';
import { getBangumiModulePrefs } from '@/lib/media/video/bangumi/prefs';

function sourceAllowed(src: string, prefs: ReturnType<typeof getBangumiModulePrefs>): boolean {
  const s = src.toLowerCase();
  if (!s) return true;
  if (s.includes('bili') || s.includes('bilibili')) return prefs.danmakuSourceBilibili;
  if (s.includes('gamer') || s.includes('bahamut')) return prefs.danmakuSourceGamer;
  if (s.includes('dandan')) return prefs.danmakuSourceDandan;
  // 未知来源：若三者皆关则仍保留，避免误杀；有明确来源才过滤
  return true;
}

function modeAllowed(mode: unknown, prefs: ReturnType<typeof getBangumiModulePrefs>): boolean {
  const m = Number(mode);
  // artplayer-plugin-danmuku 常见：0 滚动 / 1 顶部 / 2 底部
  if (m === 1) return prefs.danmakuTop;
  if (m === 2) return prefs.danmakuBottom;
  return prefs.danmakuScroll;
}

export function filterDanmakuList(list: Danmu[]): Danmu[] {
  const prefs = getBangumiModulePrefs();
  const kws = prefs.danmakuBlockKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
  let out = list.filter((d) => {
    const text = String((d as { text?: string }).text ?? '').toLowerCase();
    if (kws.some((k) => text.includes(k))) return false;
    const src = String((d as { source?: string }).source ?? '');
    if (!sourceAllowed(src, prefs)) return false;
    const mode = (d as { mode?: number }).mode;
    if (!modeAllowed(mode, prefs)) return false;
    return true;
  });

  if (prefs.danmakuDeduplication) {
    const seen = new Set<string>();
    out = out.filter((d) => {
      const key = String((d as { text?: string }).text ?? '').trim().toLowerCase();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return out;
}

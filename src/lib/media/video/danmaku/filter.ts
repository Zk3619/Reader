/**
 * 弹幕过滤（关键词 / 顶底滚类型 / 去重）
 * 读全局 danmakuPrefs；选源由 danmu_api sourceOrder 负责，不再按 bili/gamer/dandan 过滤
 */

import type { Danmu } from 'artplayer-plugin-danmuku';
import { getDanmakuPrefs } from '@/lib/media/video/danmaku/danmaku-prefs';

function modeAllowed(mode: unknown, prefs: ReturnType<typeof getDanmakuPrefs>): boolean {
  const m = Number(mode);
  // artplayer-plugin-danmuku：0 滚动 / 1 顶部 / 2 底部
  if (m === 1) return prefs.danmakuTop;
  if (m === 2) return prefs.danmakuBottom;
  return prefs.danmakuScroll;
}

export function filterDanmakuList(list: Danmu[]): Danmu[] {
  const prefs = getDanmakuPrefs();
  const kws = prefs.danmakuBlockKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
  let out = list.filter((d) => {
    const text = String((d as { text?: string }).text ?? '').toLowerCase();
    if (kws.some((k) => text.includes(k))) return false;
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

  const offset = prefs.danmakuTimeOffset;
  if (offset) {
    out = out.map((d) => ({
      ...d,
      time: Math.max(0, Number((d as { time?: number }).time ?? 0) + offset),
    }));
  }

  // 颜色 / 描边 / 字重
  if (!prefs.danmakuColor || prefs.danmakuBorder || prefs.danmakuFontWeight !== 4) {
    const weight = Math.round(prefs.danmakuFontWeight) * 100;
    out = out.map((d) => {
      const next = { ...d } as Danmu & { style?: Record<string, string>; color?: string };
      if (!prefs.danmakuColor) next.color = '#ffffff';
      const style: Record<string, string> = { ...(next.style ?? {}) };
      if (prefs.danmakuFontWeight !== 4) {
        style.fontWeight = String(Math.min(900, Math.max(100, weight)));
      }
      if (prefs.danmakuBorder) {
        const px = prefs.danmakuBorderSize;
        style.textShadow = `0 0 ${px}px #000, 0 0 ${px * 1.5}px #000, 1px 1px ${px}px #000`;
      }
      if (Object.keys(style).length) next.style = style;
      return next;
    });
  }

  return out;
}

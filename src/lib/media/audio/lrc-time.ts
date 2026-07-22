/**
 * LRC 时间戳解析（标准 [mm:ss.xxx] + MusicFree/酷我等 [ss] / [ss.xx]）
 */

/** 匹配时间标签；不含 [ti:]/[ar:] 等元信息 */
export const LRC_TIME_TAG_RE = /\[[\d:.]+\]/g;

/**
 * 将时间标签解析为毫秒。
 * - `[mm:ss]` / `[mm:ss.xxx]`：对齐 LX（小数段按原始整数毫秒，不 pad）
 * - `[ss]` / `[ss.xx]`：MusicFree 秒制，整段按浮点秒换算
 */
export function parseLrcTimeTagToMs(tag: string): number | null {
  const inner = tag.startsWith('[') && tag.endsWith(']') ? tag.slice(1, -1) : tag;
  if (!inner || !/^[\d:.]+$/.test(inner)) return null;

  const parts = inner.split(':');
  if (parts.length === 1) {
    const sec = Number(parts[0]);
    if (!Number.isFinite(sec) || sec < 0) return null;
    return Math.round(sec * 1000);
  }

  if (parts.length === 2) {
    const min = Number(parts[0]);
    if (!Number.isFinite(min) || min < 0) return null;
    const secPart = parts[1]!;
    const dot = secPart.indexOf('.');
    if (dot < 0) {
      const sec = Number(secPart);
      if (!Number.isFinite(sec)) return null;
      return Math.round(min * 60_000 + sec * 1000);
    }
    const sec = Number(secPart.slice(0, dot));
    const fracRaw = secPart.slice(dot + 1);
    // 对齐 lx：小数部分按原始整数毫秒解析（勿 padEnd）
    const frac = fracRaw ? parseInt(fracRaw, 10) : 0;
    if (!Number.isFinite(sec)) return null;
    return min * 60_000 + sec * 1000 + (Number.isFinite(frac) ? frac : 0);
  }

  if (parts.length === 3) {
    const h = Number(parts[0]);
    const min = Number(parts[1]);
    const sec = Number(parts[2]);
    if (![h, min, sec].every((n) => Number.isFinite(n) && n >= 0)) return null;
    return Math.round((h * 3600 + min * 60 + sec) * 1000);
  }

  return null;
}

export function parseLrcTimeTagToSec(tag: string): number | null {
  const ms = parseLrcTimeTagToMs(tag);
  return ms == null ? null : ms / 1000;
}

/** MusicFree `[13.47]` → 标准 `[00:13.47]`，便于下载/旁路与其它解析器 */
export function normalizeMfStyleLrcTimestamps(raw: string): string {
  return raw.replace(/\[(\d+(?:\.\d+)?)\]/g, (full, secStr: string) => {
    const sec = Number(secStr);
    if (!Number.isFinite(sec) || sec < 0) return full;
    const min = Math.floor(sec / 60);
    const rem = sec - min * 60;
    const secInt = Math.floor(rem);
    const centi = Math.round((rem - secInt) * 100);
    return `[${String(min).padStart(2, '0')}:${String(secInt).padStart(2, '0')}.${String(centi).padStart(2, '0')}]`;
  });
}

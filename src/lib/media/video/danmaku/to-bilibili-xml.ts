/**
 * Danmu[] → Bilibili XML（FlameMaster / BiliDanmakuParser）
 */

import type { Danmu } from 'artplayer-plugin-danmuku';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colorToInt(color?: string): number {
  if (!color) return 16777215;
  const m = String(color).trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return 16777215;
  return Number.parseInt(m[1], 16);
}

/**
 * B站 XML：`<d p="time,mode,size,color,...">text</d>`
 * mode: 1 滚动 · 5 顶 · 4 底
 */
export function danmuToBilibiliXml(danmu: Danmu[], maxCount = 8000): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?><i>'];
  const sorted = [...danmu].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  let n = 0;
  for (const d of sorted) {
    if (n >= maxCount) break;
    const text = String(d.text ?? '').trim();
    if (!text) continue;
    const time = typeof d.time === 'number' ? Math.max(0, d.time) : 0;
    const mode = d.mode === 1 ? 5 : d.mode === 2 ? 4 : 1;
    const color = colorToInt(d.color);
    lines.push(
      `<d p="${time.toFixed(2)},${mode},25,${color},0,0,0,0">${escapeXml(text)}</d>`,
    );
    n += 1;
  }
  lines.push('</i>');
  return lines.join('\n');
}

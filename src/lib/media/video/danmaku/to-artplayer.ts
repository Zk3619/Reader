/**
 * 将弹弹 / B 站 / danmu_api 弹幕转为 artplayer-plugin-danmuku Danmu[]
 */

import type { Danmu } from 'artplayer-plugin-danmuku';

export type DanmuWithPlatform = Danmu & { platform?: string };

/** 从 danmu_api comment.p 尾部解析 [platform] */
export function parsePlatformFromDanmuP(p: string): string | undefined {
  const m = String(p).match(/\[([a-z0-9_]+)\]\s*$/i);
  return m?.[1]?.toLowerCase();
}

/** 弹弹 / danmu_api comment API：comments[].p = "time,mode,color,..." / m = text */
export function danDanCommentsToDanmu(raw: unknown): DanmuWithPlatform[] {
  const root = raw as {
    comments?: Array<{ p?: string; m?: string }>;
  };
  const list = root.comments ?? [];
  const out: DanmuWithPlatform[] = [];
  for (const c of list) {
    const text = (c.m ?? '').trim();
    if (!text) continue;
    const pStr = String(c.p ?? '');
    const parts = pStr.split(',');
    const time = Number(parts[0]);
    const modeRaw = Number(parts[1]);
    // 弹弹：1滚动 4底部 5顶部 → artplayer 0/2/1
    let mode: 0 | 1 | 2 = 0;
    if (modeRaw === 5) mode = 1;
    else if (modeRaw === 4) mode = 2;
    const colorNum = Number(parts[2]);
    const color =
      Number.isFinite(colorNum) && colorNum > 0
        ? `#${(colorNum & 0xffffff).toString(16).padStart(6, '0')}`
        : undefined;
    const platform = parsePlatformFromDanmuP(pStr);
    out.push({
      text,
      time: Number.isFinite(time) ? time : 0,
      mode,
      color,
      ...(platform ? { platform } : {}),
    });
  }
  return out;
}

/** B 站 XML：<d p="time,mode,size,color,...">text</d> */
export function biliXmlToDanmu(xml: string): DanmuWithPlatform[] {
  const out: DanmuWithPlatform[] = [];
  const re = /<d\s+p="([^"]*)"[^>]*>([^<]*)<\/d>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const parts = m[1].split(',');
    const time = Number(parts[0]);
    const modeRaw = Number(parts[1]);
    let mode: 0 | 1 | 2 = 0;
    if (modeRaw === 5) mode = 1;
    else if (modeRaw === 4) mode = 2;
    const colorNum = Number(parts[3]);
    const color =
      Number.isFinite(colorNum) && colorNum > 0
        ? `#${(colorNum & 0xffffff).toString(16).padStart(6, '0')}`
        : undefined;
    const text = decodeXmlEntities(m[2]).trim();
    if (!text) continue;
    out.push({
      text,
      time: Number.isFinite(time) ? time : 0,
      mode,
      color,
      platform: 'bilibili',
    });
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

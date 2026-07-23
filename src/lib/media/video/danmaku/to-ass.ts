/**
 * 弹幕 → ASS（增强窗 sub-add 路径）
 * mode: 0 滚动 \move · 1 顶部 · 2 底部（与 artplayer-plugin-danmuku 一致）
 */

import type { Danmu } from 'artplayer-plugin-danmuku';

export type DanmakuToAssOptions = {
  fontSize?: number;
  /** 0–100，越大越不透明 */
  opacity?: number;
  /** 滚动/固定展示时长（秒） */
  durationSec?: number;
  /** 相同文案合并窗口；0=关闭 */
  mergeSec?: number;
  /** 最多写入条数 */
  maxCount?: number;
  playResX?: number;
  playResY?: number;
};

const DEFAULTS = {
  fontSize: 48,
  opacity: 92,
  durationSec: 8,
  mergeSec: 1,
  maxCount: 2000,
  playResX: 1920,
  playResY: 1080,
} as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function escapeAss(text: string): string {
  return text.replace(/[{}\\]/g, '\\$&').replace(/\n/g, ' ');
}

function formatAssTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const whole = Math.floor(r);
  const cs = Math.floor((r - whole) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function estimateWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    w += /[\u4e00-\u9fff]/.test(ch) ? fontSize : fontSize * 0.55;
  }
  return Math.max(fontSize, w);
}

/** ASS PrimaryColour / \c：&HAABBGGRR（AA=00 不透明） */
function cssToAssPrimary(color: string | undefined, opacityPct: number): string {
  const alpha = Math.round((1 - clamp(opacityPct, 0, 100) / 100) * 255);
  let r = 255;
  let g = 255;
  let b = 255;
  if (color) {
    const m = String(color).trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (m) {
      r = Number.parseInt(m[1].slice(0, 2), 16);
      g = Number.parseInt(m[1].slice(2, 4), 16);
      b = Number.parseInt(m[1].slice(4, 6), 16);
    }
  }
  const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `&H${hex(alpha)}${hex(b)}${hex(g)}${hex(r)}`;
}

function colorOverride(color: string | undefined): string {
  if (!color) return '';
  const m = String(color).trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return '';
  const r = Number.parseInt(m[1].slice(0, 2), 16);
  const g = Number.parseInt(m[1].slice(2, 4), 16);
  const b = Number.parseInt(m[1].slice(4, 6), 16);
  const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `\\c&H${hex(b)}${hex(g)}${hex(r)}&`;
}

type LaneSlot = { freeAt: number };

/**
 * 将 Danmu[] 转为 ASS v4+ 文本（滚动用 \\move，顶/底用 \\pos）。
 */
export function danmuToAss(danmu: Danmu[], options?: DanmakuToAssOptions): string {
  const fontSize = clamp(options?.fontSize ?? DEFAULTS.fontSize, 16, 96);
  const opacity = clamp(options?.opacity ?? DEFAULTS.opacity, 0, 100);
  const durationSec = clamp(options?.durationSec ?? DEFAULTS.durationSec, 2, 30);
  const mergeSec = clamp(options?.mergeSec ?? DEFAULTS.mergeSec, 0, 30);
  const maxCount = clamp(options?.maxCount ?? DEFAULTS.maxCount, 100, 20000);
  const playResX = options?.playResX ?? DEFAULTS.playResX;
  const playResY = options?.playResY ?? DEFAULTS.playResY;
  const lineH = fontSize + 6;
  const maxScrollLanes = Math.max(4, Math.floor((playResY * 0.55) / lineH));
  const maxFixedLanes = Math.max(2, Math.floor((playResY * 0.25) / lineH));

  const sorted = [...danmu]
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      const ta = typeof a.d.time === 'number' ? a.d.time : 0;
      const tb = typeof b.d.time === 'number' ? b.d.time : 0;
      return ta - tb || a.i - b.i;
    });

  const scrollLanes: LaneSlot[] = Array.from({ length: maxScrollLanes }, () => ({ freeAt: 0 }));
  const topLanes: LaneSlot[] = Array.from({ length: maxFixedLanes }, () => ({ freeAt: 0 }));
  const bottomLanes: LaneSlot[] = Array.from({ length: maxFixedLanes }, () => ({ freeAt: 0 }));

  const lastMerged = new Map<string, number>();
  const dialogues: string[] = [];
  const primary = cssToAssPrimary(undefined, opacity);

  for (const { d } of sorted) {
    if (dialogues.length >= maxCount) break;
    const raw = String(d.text ?? '').trim();
    if (!raw) continue;
    const t = typeof d.time === 'number' && Number.isFinite(d.time) ? Math.max(0, d.time) : 0;
    if (mergeSec > 0) {
      const prev = lastMerged.get(raw);
      if (prev !== undefined && t - prev < mergeSec) continue;
      lastMerged.set(raw, t);
    }

    const mode = d.mode === 1 || d.mode === 2 ? d.mode : 0;
    const end = t + durationSec;
    const text = escapeAss(raw);
    const cOv = colorOverride(d.color);
    const startS = formatAssTime(t);
    const endS = formatAssTime(end);

    if (mode === 1) {
      let lane = topLanes.findIndex((s) => s.freeAt <= t);
      if (lane < 0) lane = 0;
      topLanes[lane]!.freeAt = end;
      const y = 20 + lane * lineH;
      const body = `{${cOv}\\an8\\pos(${Math.floor(playResX / 2)},${y})}${text}`;
      dialogues.push(`Dialogue: 0,${startS},${endS},Default,,0,0,0,,${body}`);
      continue;
    }

    if (mode === 2) {
      let lane = bottomLanes.findIndex((s) => s.freeAt <= t);
      if (lane < 0) lane = 0;
      bottomLanes[lane]!.freeAt = end;
      const y = playResY - 20 - lane * lineH;
      const body = `{${cOv}\\an2\\pos(${Math.floor(playResX / 2)},${y})}${text}`;
      dialogues.push(`Dialogue: 0,${startS},${endS},Default,,0,0,0,,${body}`);
      continue;
    }

    const tw = estimateWidth(raw, fontSize);
    const travel = playResX + tw;
    const speed = travel / durationSec;
    let best = 0;
    let bestFree = Number.POSITIVE_INFINITY;
    for (let i = 0; i < scrollLanes.length; i++) {
      const free = scrollLanes[i]!.freeAt;
      if (free <= t) {
        best = i;
        bestFree = free;
        break;
      }
      if (free < bestFree) {
        bestFree = free;
        best = i;
      }
    }
    const occupy = tw / speed;
    scrollLanes[best]!.freeAt = t + Math.max(0.4, occupy);
    const y = 40 + best * lineH;
    const x0 = playResX;
    const x1 = -Math.ceil(tw);
    const body = `{${cOv}\\move(${x0},${y},${x1},${y})}${text}`;
    dialogues.push(`Dialogue: 0,${startS},${endS},Default,,0,0,0,,${body}`);
  }

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,${fontSize},${primary},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogues.join('\n')}
`;
}

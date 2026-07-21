/**
 * 下载用歌词合并（对齐 LX Desktop `lrcTool.buildLyrics`）
 * 将翻译 / 罗马音明文与 awlrc 扩展块写入同一 `.lrc`。
 */

import type { LyricBundle } from '@/lib/media/audio/lyric-types';

const timeFieldExp = /^(?:\[[\d:.]+\])+/g;
const timeExp = /\d{1,3}(:\d{1,3}){0,2}(?:\.\d{1,3})/g;

const tRxp1 = /^0+(\d+)/;
const tRxp2 = /:0+(\d+)/g;
const tRxp3 = /\.0+(\d+)/;

function formatTimeLabel(label: string): string {
  return label
    .replace(tRxp1, '$1')
    .replace(tRxp2, ':$1')
    .replace(tRxp3, '.$1');
}

function filterExtendedLyricLabel(
  lrcTimeLabels: Set<string>,
  extendedLyric: string,
): string {
  const extendedLines = extendedLyric.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (let i = 0; i < extendedLines.length; i++) {
    let line = extendedLines[i]!.trim();
    const result = timeFieldExp.exec(line);
    timeFieldExp.lastIndex = 0;
    if (!result) continue;

    const timeField = result[0];
    const text = line.replace(timeFieldExp, '').trim();
    timeFieldExp.lastIndex = 0;
    if (!text) continue;
    const times = timeField.match(timeExp);
    if (times == null) continue;

    const newTimes = times.filter((time) => {
      const timeStr = formatTimeLabel(time);
      return lrcTimeLabels.has(timeStr);
    });
    if (newTimes.length !== times.length) {
      if (!newTimes.length) continue;
      line = `[${newTimes.join('][')}]${text}`;
    }
    lines.push(line);
  }

  return lines.join('\n');
}

function parseLrcTimeLabel(lrc: string): Set<string> {
  const lines = lrc.split(/\r\n|\n|\r/);
  const linesSet = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const result = timeFieldExp.exec(line);
    timeFieldExp.lastIndex = 0;
    if (!result) continue;
    const timeField = result[0];
    const text = line.replace(timeFieldExp, '').trim();
    timeFieldExp.lastIndex = 0;
    if (!text) continue;
    const times = timeField.match(timeExp);
    if (times == null) continue;
    for (const time of times) {
      linesSet.add(formatTimeLabel(time));
    }
  }
  return linesSet;
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function buildAwlyric(lrcData: LyricBundle): string {
  const parts: string[] = [];
  if (lrcData.lyric?.trim()) {
    parts.push(`lrc:${utf8ToBase64(lrcData.lyric.trim())}`);
  }
  if (lrcData.tlyric?.trim()) {
    parts.push(`tlrc:${utf8ToBase64(lrcData.tlyric.trim())}`);
  }
  if (lrcData.rlyric?.trim()) {
    parts.push(`rlrc:${utf8ToBase64(lrcData.rlyric.trim())}`);
  }
  if (lrcData.lxlyric?.trim()) {
    parts.push(`awlrc:${utf8ToBase64(lrcData.lxlyric.trim())}`);
  }
  return parts.length ? `[awlrc:${parts.join(',')}]` : '';
}

export type BuildLyricsOptions = {
  includeLx?: boolean;
  includeT?: boolean;
  includeR?: boolean;
};

/** 合并多轨歌词为一份可写入 `.lrc` / 嵌入的文本 */
export function buildLyrics(
  lrcData: LyricBundle,
  options: BuildLyricsOptions = {},
): string {
  const includeLx = options.includeLx !== false;
  const includeT = options.includeT === true;
  const includeR = options.includeR === true;
  const main = (lrcData.lyric ?? '').trim();
  if (!lrcData.tlyric && !lrcData.rlyric && !lrcData.lxlyric) {
    return main || (lrcData.lxlyric ?? '').trim();
  }
  if (!main && lrcData.lxlyric?.trim()) {
    // 仅有扩展轨时仍尽量写出
    let lrc = lrcData.lxlyric.trim();
    if (includeLx) {
      const awlrc = buildAwlyric({ ...lrcData, lyric: lrc });
      if (awlrc) lrc = `${lrc}\n\n${awlrc}\n`;
    }
    return lrc;
  }

  const lrcTimeLabels = parseLrcTimeLabel(main);
  let lrc = main;
  if (includeT && lrcData.tlyric) {
    lrc = `${lrc.trim()}\n\n${filterExtendedLyricLabel(lrcTimeLabels, lrcData.tlyric)}\n`;
  }
  if (includeR && lrcData.rlyric) {
    lrc = `${lrc.trim()}\n\n${filterExtendedLyricLabel(lrcTimeLabels, lrcData.rlyric)}\n`;
  }
  if (includeLx) {
    const awlrc = buildAwlyric(lrcData);
    if (awlrc) lrc = `${lrc.trim()}\n\n${awlrc}\n`;
  }
  return lrc;
}

export type DownloadLrcFormat = 'utf8' | 'gbk';

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** UTF-8（带 BOM）或 GBK（Tauri）；Web 上 GBK 降级为 UTF-8 BOM */
export async function encodeLyricFileBytes(
  text: string,
  format: DownloadLrcFormat,
): Promise<Uint8Array> {
  if (format === 'gbk') {
    try {
      const { isTauri } = await import('@/lib/platform/detect');
      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core');
        const bytes = await invoke<number[]>('encode_gbk', { text });
        return new Uint8Array(bytes);
      }
    } catch {
      /* fall through to utf8 */
    }
  }
  return concatBytes(UTF8_BOM, new TextEncoder().encode(text));
}

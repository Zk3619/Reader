/**
 * QQ QRC / LRC → lxlyric（对齐 lx tx/lyric.js parseTools）
 *
 * 解密默认走前端 `decodeTxQrcFrontend`；
 * Tauri `invokeDecodeTxQrc` 保留，供未来切回原生高性能分支。
 */

import { decodeTxQrcFrontend, type TxQrcDecodeResult } from './tx-qrc-decode';

function msFormat(timeMs: number): string {
  if (Number.isNaN(timeMs)) return '';
  const ms = timeMs % 1000;
  timeMs = Math.floor(timeMs / 1000);
  const m = Math.floor(timeMs / 60)
    .toString()
    .padStart(2, '0');
  timeMs %= 60;
  const s = Math.floor(timeMs).toString().padStart(2, '0');
  return `[${m}:${s}.${String(ms).padStart(3, '0')}]`;
}

function removeTag(str: string): string {
  return str.replace(/^[\S\s]*?LyricContent="/, '').replace(/"\/>[\S\s]*?$/, '');
}

function parseQrcLyric(lrc: string): { lyric: string; lxlyric: string } {
  lrc = removeTag(lrc.trim()).replace(/\r/g, '');
  if (!lrc) return { lyric: '', lxlyric: '' };
  const lines = lrc.split('\n');
  const lxlrcLines: string[] = [];
  const lrcLines: string[] = [];
  const lineTime = /^\[(\d+),\d+\]/;
  const wordTime = /\(\d+,\d+\)/;
  const wordTimeAll = /(\(\d+,\d+\))/g;
  const lineTime2 = /^\[([\d:.]+)\]/;

  for (let line of lines) {
    line = line.trim();
    let result = lineTime.exec(line);
    if (!result) {
      if (line.startsWith('[offset')) {
        lxlrcLines.push(line);
        lrcLines.push(line);
      }
      if (lineTime2.test(line)) lrcLines.push(line);
      continue;
    }
    const startMsTime = parseInt(result[1]!, 10);
    const startTimeStr = msFormat(startMsTime);
    if (!startTimeStr) continue;
    let words = line.replace(lineTime, '');
    lrcLines.push(`${startTimeStr}${words.replace(wordTimeAll, '')}`);
    const timesRaw = words.match(wordTimeAll);
    if (!timesRaw) continue;
    const times = timesRaw.map((t) => {
      const m = /\((\d+),(\d+)\)/.exec(t);
      return `<${Math.max(parseInt(m![1]!, 10) - startMsTime, 0)},${m![2]!}>`;
    });
    const wordArr = words.split(wordTime);
    const newWords = times.map((t, i) => `${t}${wordArr[i] ?? ''}`).join('');
    lxlrcLines.push(`${startTimeStr}${newWords}`);
  }
  return { lyric: lrcLines.join('\n'), lxlyric: lxlrcLines.join('\n') };
}

export function parseTxQrcBundle(
  lyricRaw: string,
  tlyricRaw = '',
  rlyricRaw = '',
): { lyric: string; tlyric: string; rlyric: string; lxlyric: string } {
  const parsed = parseQrcLyric(lyricRaw);
  return {
    lyric: parsed.lyric,
    lxlyric: parsed.lxlyric,
    tlyric: tlyricRaw
      ? removeTag(tlyricRaw)
          .replace(/\r/g, '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .join('\n')
      : '',
    rlyric: rlyricRaw
      ? removeTag(rlyricRaw)
          .replace(/\r/g, '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .join('\n')
      : '',
  };
}

/**
 * 当前默认：纯前端解密。
 * 切回 Tauri 高性能分支时：改为先 `invokeDecodeTxQrc`，失败再 `decodeTxQrcFrontend`。
 */
export async function decodeTxQrc(
  lrc: string,
  tlrc: string,
  rlrc: string,
): Promise<TxQrcDecodeResult | null> {
  return decodeTxQrcFrontend(lrc, tlrc, rlrc);
}

/**
 * Tauri 侧解密（`decode_tx_qrc_lyric`）。
 * 保留供未来以原生为主路径时启用；当前默认请用 `decodeTxQrc`。
 */
export async function invokeDecodeTxQrc(
  lrc: string,
  tlrc: string,
  rlrc: string,
): Promise<TxQrcDecodeResult | null> {
  try {
    const { isTauri } = await import('@/lib/platform/detect');
    if (!isTauri()) return null;
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<TxQrcDecodeResult>('decode_tx_qrc_lyric', {
      lrc,
      tlrc,
      rlrc,
    });
  } catch {
    return null;
  }
}

/**
 * 播放地址抽取器子集：Video / Strm / Youtube(可选 yt-dlp)
 */

import { tvGet } from '../net/rules';

export type ExtractResult = {
  url: string;
  header?: Record<string, string>;
  msg?: string;
};

function isDirect(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('.m3u8') ||
    u.includes('.mp4') ||
    u.includes('.flv') ||
    u.includes('.mkv') ||
    u.includes('.ts')
  );
}

async function extractStrm(url: string): Promise<ExtractResult | null> {
  if (!/\.strm(\?|$)/i.test(url)) return null;
  const body = (await tvGet(url, { timeout: 12000 })).trim();
  const line = body.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
  if (line) return { url: line };
  return null;
}

async function extractVideoPage(url: string): Promise<ExtractResult | null> {
  if (isDirect(url)) return { url };
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const body = await tvGet(url, { timeout: 12000 });
    const m = body.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv)[^\s"'<>]*/i);
    if (m?.[0]) return { url: m[0] };
  } catch {
    /* */
  }
  return null;
}

async function extractYoutube(url: string): Promise<ExtractResult | null> {
  if (!/youtu\.?be|youtube\.com/i.test(url)) return null;
  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    const cmd = Command.create('yt-dlp', ['-f', 'bv*+ba/b', '-g', '--no-playlist', url]);
    const out = await cmd.execute();
    const line = out.stdout.trim().split(/\r?\n/).find((l) => l.startsWith('http'));
    if (line) return { url: line };
  } catch {
    /* yt-dlp 不可用 */
  }
  return null;
}

export async function extractPlayUrl(url: string): Promise<ExtractResult> {
  if (!url) return { url: '' };
  if (url.startsWith('push://')) {
    return extractPlayUrl(url.slice('push://'.length));
  }
  if (/^(magnet:|ed2k:|thunder:)/i.test(url) || /magnet:\?|ed2k:\/\//i.test(url)) {
    return {
      url,
      msg: '磁力/ed2k 桌面不支持（无迅雷 so），请用系统下载器',
    };
  }
  const yt = await extractYoutube(url);
  if (yt) return yt;
  const strm = await extractStrm(url);
  if (strm) return strm;
  if (isDirect(url)) return { url };
  const page = await extractVideoPage(url);
  if (page) return page;
  return { url };
}

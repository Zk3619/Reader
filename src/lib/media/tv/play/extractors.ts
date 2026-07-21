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
    const err = (out.stderr || out.stdout || '').trim().slice(0, 200);
    return {
      url: '',
      msg: err
        ? `yt-dlp 未取到直链：${err}`
        : 'yt-dlp 未取到直链，请确认已安装并加入 PATH',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      url: '',
      msg: `yt-dlp 不可用：${msg}（网盘请用带 token 的 CSP/JAR 源）`,
    };
  }
}

export async function extractPlayUrl(url: string): Promise<ExtractResult> {
  if (!url) return { url: '' };
  if (url.startsWith('push://')) {
    return extractPlayUrl(url.slice('push://'.length));
  }
  if (/^(magnet:|ed2k:|thunder:)/i.test(url) || /magnet:\?|ed2k:\/\//i.test(url)) {
    // 桌面无迅雷 so：尝试交给系统默认处理（下载器/浏览器）
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
      return {
        url: '',
        msg: '已唤起系统处理磁力/ed2k（桌面无边下边播）',
      };
    } catch {
      return {
        url: '',
        msg: '磁力/ed2k 桌面不支持边下边播，请安装系统下载器后重试',
      };
    }
  }
  // P2P 专有协议（FongMi TVBus/Force/荐片等）— 桌面不移植 so
  if (
    /^(tvbus|mitv|force|jianpian|tvbox-xg|p2p):/i.test(url) ||
    /\/\/(tvbus|forcetech|jianpian)/i.test(url)
  ) {
    return {
      url: '',
      msg: 'P2P 特殊引擎（TVBus/Force/荐片）桌面不支持，请换直链源',
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

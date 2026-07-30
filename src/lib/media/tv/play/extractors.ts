/**
 * 播放地址抽取器子集：Video / Strm / Youtube（进程内 YoutubeDL，不侧载 yt-dlp）
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

async function extractViaYoutubeDL(url: string): Promise<ExtractResult | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const { YoutubeDL } = await import('@/lib/download/ytdlp');
    const ydl = new YoutubeDL({
      quiet: true,
      noplaylist: true,
      format: 'bv*+ba/b',
    });
    const info = await ydl.extract_info(url, false);
    if (!info) return null;
    const formats = Array.isArray(info.formats) ? info.formats : [];
    const best =
      formats.find((f) => f.url && (f.vcodec !== 'none' || f.acodec !== 'none')) ||
      formats.find((f) => f.url);
    if (best?.url) {
      return {
        url: best.url,
        header: best.http_headers as Record<string, string> | undefined,
      };
    }
    if (info.url) return { url: String(info.url) };
    return {
      url: '',
      msg: '媒体提取未取到直链',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unsupported URL|No suitable|suitable extractor/i.test(msg)) return null;
    return {
      url: '',
      msg: `媒体提取失败：${msg.slice(0, 200)}`,
    };
  }
}

export async function extractPlayUrl(url: string): Promise<ExtractResult> {
  if (!url) return { url: '' };
  if (url.startsWith('push://')) {
    return extractPlayUrl(url.slice('push://'.length));
  }
  if (/^(magnet:|ed2k:|thunder:)/i.test(url) || /magnet:\?|ed2k:\/\//i.test(url)) {
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
        msg: '磁力/ed2k 桌面不支持边下边播，请使用下载模块',
      };
    }
  }
  if (
    /^(tvbus|mitv|force|jianpian|tvbox-xg|p2p):/i.test(url) ||
    /\/\/(tvbus|forcetech|jianpian)/i.test(url)
  ) {
    return {
      url: '',
      msg: 'P2P 特殊引擎（TVBus/Force/荐片）桌面不支持，请换直链源',
    };
  }
  const media = await extractViaYoutubeDL(url);
  if (media) return media;
  const strm = await extractStrm(url);
  if (strm) return strm;
  if (isDirect(url)) return { url };
  const page = await extractVideoPage(url);
  if (page) return page;
  return { url };
}

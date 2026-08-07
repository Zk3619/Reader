/**
 * Specialized protocol handlers (yt-dlp FD subset) wired into engine-bridge.
 */

import { invoke } from '@tauri-apps/api/core';

import { downloadBinaryProxyArgs } from '@/lib/http/download-binary-proxy';

export type SpecialProtocol =
  | 'mhtml'
  | 'niconico_live'
  | 'fc2_live'
  | 'bunnycdn'
  | 'youtube_live_chat'
  | 'youtube_live_chat_replay'
  | 'soop_vod'
  | 'websocket_frag'
  | 'websocket'
  | 'rtmpe'
  | 'rtmpt'
  | 'rtmpdump';

export function detectSpecialProtocol(protocol?: string, url?: string): SpecialProtocol | null {
  const p = (protocol || '').toLowerCase();
  const u = (url || '').toLowerCase();
  if (p === 'websocket_frag' || p === 'websocket') return 'websocket_frag';
  if (/^wss?:\/\//i.test(url || '')) return 'websocket_frag';
  if (p === 'mhtml' || u.endsWith('.mhtml') || u.includes('mhtml')) return 'mhtml';
  if (p === 'niconico_live' || (u.includes('nicovideo.jp') && u.includes('live'))) return 'niconico_live';
  if (p === 'fc2_live' || u.includes('live.fc2.com')) return 'fc2_live';
  if (p === 'bunnycdn' || u.includes('b-cdn.net')) return 'bunnycdn';
  if (p === 'youtube_live_chat_replay') return 'youtube_live_chat_replay';
  if (p === 'youtube_live_chat' || p === 'live_chat') return 'youtube_live_chat';
  // IE may emit soopvod (upstream) or soop_vod
  if (p === 'soop_vod' || p === 'soopvod') return 'soop_vod';
  if (p === 'rtmpe' || /^rtmpe:\/\//i.test(url || '')) return 'rtmpe';
  if (p === 'rtmpt' || /^rtmpt:\/\//i.test(url || '')) return 'rtmpt';
  return null;
}

async function pingBunny(opts: {
  url: string;
  headers?: Record<string, string>;
  secret: string;
  contextId: string;
  stop: { stopped: boolean };
}): Promise<void> {
  const { md5Hex } = await import('./md5');
  let currentTime = 0;
  const res = 1080;
  const paused = 'false';
  while (!opts.stop.stopped) {
    await new Promise((r) => setTimeout(r, 2000));
    if (opts.stop.stopped) break;
    currentTime += 2;
    const time = currentTime + Math.random();
    const md5 = md5Hex(`${opts.secret}_${opts.contextId}_${time}_${paused}_${res}`);
    const pingUrl = `${opts.url}?hash=${md5}&time=${time}&paused=${paused}&resolution=${res}`;
    try {
      await invoke('download_binary', {
        url: pingUrl,
        method: 'GET',
        headers: opts.headers || {},
        body: null,
        timeoutMs: 10000,
        useOkhttpUserAgent: false,
        ...downloadBinaryProxyArgs(),
      });
    } catch {
      /* ping soft-fail */
    }
  }
}

/** Build multipart MHTML from a single HTML stub + optional binary resource URL. */
async function downloadMhtml(url: string, outputPath: string, headers?: Record<string, string>): Promise<string> {
  const result = await invoke<{ data: number[]; status: number }>('download_binary', {
    url,
    method: 'GET',
    headers: headers || {},
    body: null,
    timeoutMs: 120000,
    useOkhttpUserAgent: false,
    ...downloadBinaryProxyArgs(),
  });
  if (result.status >= 400) throw new Error(`HTTP ${result.status}`);
  const body = new Uint8Array(result.data);
  const boundary = `----=_yt-dlp-${Date.now().toString(36)}`;
  const isAlreadyMhtml =
    body.length > 20 &&
    (String.fromCharCode(...body.slice(0, 15)).includes('multipart') ||
      String.fromCharCode(...body.slice(0, Math.min(80, body.length))).includes('Content-Type:'));
  if (isAlreadyMhtml) {
    await invoke('write_binary_file', { path: outputPath, data: result.data });
    return outputPath;
  }
  // Wrap raw payload as single-part MHTML (slideshow sites often already multipart)
  const head = [
    'From: <saved by Reader yt-dlp>',
    'Subject: MHTML',
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    '<!DOCTYPE html><html><body><p>Resource saved by Reader</p></body></html>',
    `--${boundary}`,
    'Content-Type: application/octet-stream',
    'Content-Transfer-Encoding: base64',
    `Content-Location: ${url}`,
    '',
  ].join('\r\n');
  // base64 of body (browser: btoa + Latin1)
  let s = '';
  for (let i = 0; i < body.length; i++) s += String.fromCharCode(body[i]!);
  const b64 = btoa(s);
  const wrapped = new TextEncoder().encode(`${head}${b64}\r\n--${boundary}--\r\n`);
  await invoke('write_binary_file', { path: outputPath, data: Array.from(wrapped) });
  return outputPath;
}

/**
 * Download special protocols:
 * - websocket_frag: WS binary → ffmpeg stdin
 * - mhtml: multipart MHTML wrap or passthrough
 * - bunnycdn: HTTP/HLS + ping thread when `_bunnycdn_ping_data` present
 * - soop_vod / soopvod: HTTP (cookie refresh best-effort via headers)
 * - niconico_live / fc2_live: ffmpeg pull (+ optional heartbeat URL)
 * - youtube_live_chat*: JSONL via Innertube continuation
 * - rtmpe / rtmpt: rtmpdump when available
 */
export async function downloadSpecialProtocol(opts: {
  protocol: SpecialProtocol;
  url: string;
  outputPath: string;
  headers?: Record<string, string>;
  /** BunnyCDN ping payload from IE */
  bunnyPing?: { url: string; secret: string; context_id: string };
  /** Extra meta */
  videoId?: string;
  /** Allow rtmpdump for rtmpe/rtmpt */
  allowRtmpDump?: boolean;
}): Promise<string> {
  const { protocol, url, outputPath, headers } = opts;

  if (protocol === 'youtube_live_chat' || protocol === 'youtube_live_chat_replay') {
    const { downloadYoutubeLiveChat } = await import('./youtube-live-chat');
    return downloadYoutubeLiveChat({
      url,
      outputPath,
      headers,
      videoId: opts.videoId,
      protocol,
    });
  }

  if (protocol === 'rtmpe' || protocol === 'rtmpt' || protocol === 'rtmpdump') {
    if (!opts.allowRtmpDump) {
      throw new Error(
        `[ytdlp] ${protocol} requires rtmpdump — set allowRtmpDump / ytdlp.allowRtmpDump=true`,
      );
    }
    const { runExternalDownload } = await import('./external-downloader');
    // rtmpdump -r URL -o file
    const result = await runExternalDownload({
      kind: 'rtmpdump',
      url,
      outputPath,
      headers,
    });
    if (!result.ok) {
      throw new Error(result.warning || `rtmpdump failed for ${protocol}`);
    }
    return result.outputPath || outputPath;
  }

  if (protocol === 'websocket_frag' || protocol === 'websocket') {
    const r = await invoke<{ outputPath?: string }>('media_convert_fetch_websocket_frag', {
      url,
      outputPath,
      headers: headers || null,
    });
    return String(r?.outputPath || outputPath);
  }

  if (protocol === 'niconico_live' || protocol === 'fc2_live') {
    // Heartbeat / keepSeat: soft background GET if URL carries ws hint in query
    const stop = { stopped: false };
    const hb =
      headers?.['X-Reader-Heartbeat-Url'] ||
      headers?.['x-reader-heartbeat-url'];
    const hbTimer =
      hb &&
      setInterval(() => {
        void invoke('download_binary', {
          url: hb,
          method: 'GET',
          headers: headers || {},
          body: null,
          timeoutMs: 15000,
          useOkhttpUserAgent: false,
          ...downloadBinaryProxyArgs(),
        }).catch(() => undefined);
      }, 30_000);
    try {
      const r = await invoke<{ outputPath?: string }>('media_convert_fetch_hls', {
        url,
        outputPath,
        headers: headers || null,
        liveSeconds: 3600,
        validateSegments: false,
      });
      return String(r?.outputPath || outputPath);
    } finally {
      stop.stopped = true;
      if (hbTimer) clearInterval(hbTimer);
    }
  }

  if (protocol === 'mhtml') {
    return downloadMhtml(url, outputPath, headers);
  }

  // bunnycdn / soop_vod — HTTP binary (+ optional bunny ping)
  const stop = { stopped: false };
  let pingPromise: Promise<void> | undefined;
  if (protocol === 'bunnycdn' && opts.bunnyPing) {
    pingPromise = pingBunny({
      url: opts.bunnyPing.url,
      headers,
      secret: opts.bunnyPing.secret,
      contextId: opts.bunnyPing.context_id,
      stop,
    });
  }

  try {
    // BunnyCDN wraps HLS in upstream — prefer ffmpeg HLS when URL looks like m3u8
    if (protocol === 'bunnycdn' && /\.m3u8(?:$|\?)/i.test(url)) {
      const r = await invoke<{ outputPath?: string }>('media_convert_fetch_hls', {
        url,
        outputPath,
        headers: headers || null,
        liveSeconds: undefined,
        validateSegments: true,
      });
      return String(r?.outputPath || outputPath);
    }
    const result = await invoke<{ data: number[]; status: number }>('download_binary', {
      url,
      method: 'GET',
      headers: headers || {},
      body: null,
      timeoutMs: 120000,
      useOkhttpUserAgent: false,
      ...downloadBinaryProxyArgs(),
    });
    if (result.status >= 400) throw new Error(`HTTP ${result.status}`);
    await invoke('write_binary_file', { path: outputPath, data: result.data });
    return outputPath;
  } finally {
    stop.stopped = true;
    await pingPromise?.catch(() => undefined);
  }
}

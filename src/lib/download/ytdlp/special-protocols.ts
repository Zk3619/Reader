/**
 * Specialized protocol handlers (yt-dlp FD subset stubs wired into engine-bridge).
 * Full live FD parity is not claimed ??these routes prevent opaque failures.
 */

import { invoke } from '@tauri-apps/api/core';

import { downloadBinaryProxyArgs } from '@/lib/http/download-binary-proxy';
export type SpecialProtocol =
  | 'mhtml'
  | 'niconico_live'
  | 'fc2_live'
  | 'bunnycdn'
  | 'youtube_live_chat'
  | 'soop_vod'
  | 'websocket_frag'
  | 'websocket';

export function detectSpecialProtocol(protocol?: string, url?: string): SpecialProtocol | null {
  const p = (protocol || '').toLowerCase();
  const u = (url || '').toLowerCase();
  if (p === 'websocket_frag' || p === 'websocket') return 'websocket_frag';
  if (/^wss?:\/\//i.test(url || '')) return 'websocket_frag';
  if (p === 'mhtml' || u.endsWith('.mhtml') || u.includes('mhtml')) return 'mhtml';
  if (p === 'niconico_live' || (u.includes('nicovideo.jp') && u.includes('live'))) return 'niconico_live';
  if (p === 'fc2_live' || u.includes('live.fc2.com')) return 'fc2_live';
  if (p === 'bunnycdn' || u.includes('b-cdn.net')) return 'bunnycdn';
  if (p === 'youtube_live_chat' || p === 'live_chat') return 'youtube_live_chat';
  if (p === 'soop_vod') return 'soop_vod';
  return null;
}

/**
 * Download special protocols:
 * - websocket_frag: WS binary ??ffmpeg stdin
 * - mhtml: HTTP GET + write file
 * - bunnycdn / soop: treat as HTTP
 * - niconico_live / fc2_live: ffmpeg pull (like HLS live)
 * - youtube_live_chat: write JSONL stub note (unsupported for media)
 */
export async function downloadSpecialProtocol(opts: {
  protocol: SpecialProtocol;
  url: string;
  outputPath: string;
  headers?: Record<string, string>;
}): Promise<string> {
  const { protocol, url, outputPath, headers } = opts;

  if (protocol === 'youtube_live_chat') {
    throw new Error(
      '[ytdlp] youtube_live_chat downloader not ported: metadata only, cannot save chat',
    );
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
    const r = await invoke<{ outputPath?: string }>('media_convert_fetch_hls', {
      url,
      outputPath,
      headers: headers || null,
      liveSeconds: 3600,
      validateSegments: false,
    });
    return String(r?.outputPath || outputPath);
  }

  // mhtml / bunnycdn / soop_vod ??binary HTTP
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
}

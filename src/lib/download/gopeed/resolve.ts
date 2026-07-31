/**
 * URL 协议探测 + Tauri resolve
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import type { ResolveProtocol, ResolveResult } from '@/lib/download/task-model';

const YTDLP_HOST_HINT =
  /(?:^|\.)(?:youtube\.com|youtu\.be|bilibili\.com|b23\.tv|twitter\.com|x\.com|tiktok\.com|vimeo\.com|nicovideo\.jp|twitch\.tv|instagram\.com|facebook\.com|fb\.watch|soundcloud\.com|bandcamp\.com|music\.apple\.com|open\.spotify\.com)(?:\/|$)/i;

export type DetectedProtocol = ResolveProtocol | 'magnet' | 'torrent';

export function detectProtocol(url: string): DetectedProtocol {
  const raw = (url || '').trim();
  const lower = raw.toLowerCase();

  if (lower.startsWith('magnet:?') || lower.startsWith('magnet:')) {
    return 'magnet';
  }
  if (lower.startsWith('ed2k://')) {
    return 'ed2k';
  }
  if (
    /\.torrent(\?|#|$)/i.test(raw) ||
    (lower.startsWith('file:') && lower.endsWith('.torrent'))
  ) {
    return 'torrent';
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const host = new URL(raw).hostname;
      if (YTDLP_HOST_HINT.test(host)) return 'ytdlp';
    } catch {
      /* ignore */
    }
    return 'http';
  }
  if (YTDLP_HOST_HINT.test(raw) || /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) === false) {
    // 裸站名 / 站点短链等交给 ytdlp 提示
    if (YTDLP_HOST_HINT.test(raw) || /youtu\.?be|bilibili|tiktok/i.test(raw)) {
      return 'ytdlp';
    }
  }
  return 'http';
}

function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    if (seg) return decodeURIComponent(seg);
    return u.hostname;
  } catch {
    return url.slice(0, 80) || 'download';
  }
}

function toResolveProtocol(detected: DetectedProtocol): ResolveProtocol {
  if (detected === 'magnet' || detected === 'torrent') return 'bt';
  return detected;
}

type EngineResolvePayload = {
  name?: string;
  size?: number;
  files?: Array<{ name?: string; size?: number; selected?: boolean }>;
  protocol?: string;
};

/**
 * 解析资源元信息。
 * - magnet / .torrent / ed2k / http：Tauri 下走 `download_engine_resolve`
 * - 类 yt-dlp 站点：返回 protocol=`ytdlp` 提示（不在此处拉流）
 */
export async function resolveUrl(url: string): Promise<ResolveResult> {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    throw new Error('resolveUrl: url is empty');
  }

  const detected = detectProtocol(trimmed);
  const protocol = toResolveProtocol(detected);

  if (protocol === 'ytdlp') {
    return {
      name: nameFromUrl(trimmed),
      size: 0,
      protocol: 'ytdlp',
    };
  }

  if (isTauri()) {
    try {
      const raw = await invoke<EngineResolvePayload>('download_engine_resolve', {
        req: { url: trimmed },
      });
      const files = Array.isArray(raw?.files)
        ? raw.files.map((f) => ({
            name: String(f?.name ?? 'file'),
            size: Number(f?.size ?? 0) || 0,
            selected: f?.selected !== false,
          }))
        : undefined;
      return {
        name: String(raw?.name || nameFromUrl(trimmed)),
        size: Number(raw?.size ?? 0) || files?.reduce((s, f) => s + f.size, 0) || 0,
        files,
        protocol:
          raw?.protocol === 'bt' ||
          raw?.protocol === 'ed2k' ||
          raw?.protocol === 'http' ||
          raw?.protocol === 'ytdlp'
            ? raw.protocol
            : protocol,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 引擎未就绪时仍返回本地探测结果，便于 UI 预览
      if (/not found|unknown command|does not exist/i.test(msg)) {
        return {
          name: nameFromUrl(trimmed),
          size: 0,
          protocol,
        };
      }
      throw new Error(`download_engine_resolve failed: ${msg}`);
    }
  }

  return {
    name: nameFromUrl(trimmed),
    size: 0,
    protocol,
  };
}

/**
 * URL 协议探测 + Tauri resolve
 *
 * ytdlp 站点判定：优先用提取器注册表的 VALID_URL（覆盖全量 IE），
 * 不再维护 host 白名单（避免每测一个站就缺一项）。
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import type { ResolveProtocol, ResolveResult } from '@/lib/download/task-model';
import {
  hasSiteExtractorForUrl,
  isExtractorRegistryPopulated,
} from '@/lib/download/ytdlp/registry';

export type DetectedProtocol = ResolveProtocol | 'magnet' | 'torrent';

/** 明显直链文件：优先走通用 HTTP，避免误进 GenericIE 慢路径。 */
const DIRECT_FILE_EXT =
  /\.(?:mp4|m4a|m4v|webm|mkv|mov|mp3|flac|wav|aac|ogg|opus|jpg|jpeg|png|gif|webp|pdf|zip|rar|7z|gz|xz|exe|dmg|apk|iso)(?:$|[?#])/i;

function looksLikeDirectFileUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return DIRECT_FILE_EXT.test(u.pathname);
  } catch {
    return DIRECT_FILE_EXT.test(url);
  }
}

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
    if (looksLikeDirectFileUrl(raw)) return 'http';
    // 注册表已加载时：任意命中站点 IE → ytdlp（含 stub，避免再静默通用下载）
    if (isExtractorRegistryPopulated() && hasSiteExtractorForUrl(raw)) {
      return 'ytdlp';
    }
    return 'http';
  }
  // 裸站名等：注册表命中则 ytdlp
  if (isExtractorRegistryPopulated() && hasSiteExtractorForUrl(raw)) {
    return 'ytdlp';
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
      // 仅引擎命令未注册时回退；HTTP 404 / Not Found 必须抛出，禁止入队
      if (
        /unknown command|command not found|does not exist|Plugin not found/i.test(msg) &&
        !/\b404\b|HTTP\s*状态|status\s*异常|连接失败|timed?\s*out/i.test(msg)
      ) {
        return {
          name: nameFromUrl(trimmed),
          size: 0,
          protocol,
        };
      }
      throw new Error(msg);
    }
  }

  return {
    name: nameFromUrl(trimmed),
    size: 0,
    protocol,
  };
}

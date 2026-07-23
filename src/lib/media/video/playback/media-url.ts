/**
 * 将本地库 / StorageRef / file URL 规范为播放器可识别的媒体地址
 */

import { parseStorageRef } from '@/lib/platform/fs/storage-ref';

/** 解码 file:// 并转为本机路径（Windows 盘符路径） */
function fileUrlToPath(url: string): string | null {
  const u = url.trim();
  if (!u.toLowerCase().startsWith('file:')) return null;
  try {
    // URL 解析器能处理 file:///C:/... 与百分号编码
    const parsed = new URL(u);
    let p = decodeURIComponent(parsed.pathname || '');
    // Windows: /C:/Users/... → C:\Users\...
    if (/^\/[A-Za-z]:\//.test(p)) {
      p = p.slice(1).replace(/\//g, '\\');
    } else if (parsed.hostname) {
      // file://server/share → \\server\share
      p = `\\\\${parsed.hostname}${p}`.replace(/\//g, '\\');
    }
    return p;
  } catch {
    return null;
  }
}

/**
 * 输出可供 libmpv / 外置 mpv / VLC 使用的 URL 或绝对路径。
 * 会剥离 `path:` / `uri:` 等 StorageRef 前缀。
 */
export function resolvePlaybackMediaUrl(raw: string): string {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return '';

  const fromFile = fileUrlToPath(trimmed);
  if (fromFile) return fromFile;

  const ref = parseStorageRef(trimmed);
  if (ref.kind === 'path') return ref.value.trim();
  if (ref.kind === 'uri') {
    const v = ref.value.trim();
    const nested = fileUrlToPath(v);
    return nested ?? v;
  }
  // opfs / handle / saf 等无法直接交给 mpv
  return trimmed;
}

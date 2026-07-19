/** ArtPlayer 内置流类型（与 option.d.ts CustomType 对齐） */
export type ArtplayerStreamType = 'flv' | 'm3u8' | 'hls' | 'ts' | 'mpd';

/** 从 URL 推断 ArtPlayer customType（含代理 URL 查询串中的扩展名） */
export function detectArtplayerStreamType(url: string): ArtplayerStreamType | undefined {
  const raw = url.trim();
  if (!raw || raw.startsWith('blob:') || raw.startsWith('data:')) {
    return undefined;
  }

  const lower = raw.toLowerCase();
  const pathish = lower.split('?')[0] ?? lower;

  if (pathish.includes('.m3u8') || lower.includes('format=m3u8') || lower.includes('type=m3u8')) {
    return 'm3u8';
  }
  if (pathish.includes('.flv')) return 'flv';
  if (pathish.includes('.mpd') || lower.includes('application/dash+xml')) return 'mpd';
  if (pathish.includes('.ts') && !pathish.endsWith('.mts')) return 'ts';

  try {
    const u = new URL(raw, 'https://local.invalid');
    // 本地 proxy：?do=http&url=… / ?target=…
    for (const key of ['url', 'target', 'u'] as const) {
      const nested = u.searchParams.get(key);
      if (!nested) continue;
      try {
        const decoded = decodeURIComponent(nested);
        const nestedType = detectArtplayerStreamType(decoded);
        if (nestedType) return nestedType;
      } catch {
        /* try next */
      }
    }
  } catch {
    /* ignore */
  }

  return undefined;
}

import type { VideoPlaybackExtras } from '@/lib/media/video/artplayer/types';

/** 从书源正文 JSON / 扩展字段尝试提取字幕、预览图、弹幕地址 */
export function parseVideoPlaybackExtrasFromRaw(raw: string): VideoPlaybackExtras | undefined {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed.startsWith('{')) return undefined;
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;
    const subtitleUrl =
      pickString(data, ['subtitle', 'subtitle_url', 'sub', 'vtt']) ??
      pickString(data.data as Record<string, unknown> | undefined, ['subtitle', 'subtitle_url']);
    const vttThumbnailUrl =
      pickString(data, ['vtt', 'thumbnail_vtt', 'preview_vtt', 'thumb_vtt']) ??
      pickString(data.data as Record<string, unknown> | undefined, ['vtt', 'thumbnail_vtt']);
    const danmuku =
      pickString(data, ['danmuku', 'danmu', 'danmaku', 'danmuku_url']) ??
      pickString(data.data as Record<string, unknown> | undefined, ['danmuku', 'danmuku_url']);
    const poster = pickString(data, ['poster', 'cover', 'thumb_url']);

    if (!subtitleUrl && !vttThumbnailUrl && !danmuku && !poster) return undefined;

    return {
      subtitleUrl,
      subtitleType: 'vtt',
      vttThumbnailUrl,
      danmuku: danmuku || undefined,
      poster,
    };
  } catch {
    return undefined;
  }
}

function pickString(
  obj: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

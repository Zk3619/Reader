import type { VideoPlaybackExtras } from '@/lib/media/video/artplayer/types';

/** 裸 `vtt` 字段：文件名像预览轨时当作缩略图 VTT，否则当字幕 */
function looksLikeThumbnailVtt(url: string): boolean {
  return /thumb|preview|sprite/i.test(url);
}

/** 从书源正文 JSON / 扩展字段尝试提取字幕、预览图、弹幕地址 */
export function parseVideoPlaybackExtrasFromRaw(raw: string): VideoPlaybackExtras | undefined {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed.startsWith('{')) return undefined;
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;
    const nested = data.data as Record<string, unknown> | undefined;
    // 缩略图 VTT 须可 fetch；插件不抽帧，片源接口或本地预生成后接入
    const dedicatedThumb =
      pickString(data, ['thumbnail_vtt', 'preview_vtt', 'thumb_vtt']) ??
      pickString(nested, ['thumbnail_vtt', 'preview_vtt', 'thumb_vtt']);
    const bareVtt = pickString(data, ['vtt']) ?? pickString(nested, ['vtt']);
    const subtitleDedicated =
      pickString(data, ['subtitle', 'subtitle_url', 'sub']) ??
      pickString(nested, ['subtitle', 'subtitle_url']);

    let vttThumbnailUrl = dedicatedThumb;
    let subtitleUrl = subtitleDedicated;
    if (!vttThumbnailUrl && bareVtt && looksLikeThumbnailVtt(bareVtt)) {
      vttThumbnailUrl = bareVtt;
    } else if (!subtitleUrl && bareVtt && !vttThumbnailUrl) {
      subtitleUrl = bareVtt;
    }

    const danmuku =
      pickString(data, ['danmuku', 'danmu', 'danmaku', 'danmuku_url']) ??
      pickString(nested, ['danmuku', 'danmuku_url']);
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

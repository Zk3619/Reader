/**
 * YouTube Music 搜索
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { innertubePost } from '@/lib/media/audio/platform/api/ytm/innertube';

/** songs filter params（WEB_REMIX） */
const SONGS_PARAMS = 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D';

function walkRuns(runs?: Array<{ text?: string }>): string {
  return (runs ?? []).map((r) => r.text ?? '').join('');
}

function parseDurationLabel(label?: string): string {
  if (!label) return '00:00';
  const parts = label.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return '00:00';
  let sec = 0;
  let unit = 1;
  while (parts.length) {
    sec += (parts.pop() ?? 0) * unit;
    unit *= 60;
  }
  return formatDurationSec(sec);
}

function collectMusicResponsiveListItems(node: unknown, out: unknown[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectMusicResponsiveListItems(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.musicResponsiveListItemRenderer) {
    out.push(obj.musicResponsiveListItemRenderer);
  }
  for (const v of Object.values(obj)) collectMusicResponsiveListItems(v, out);
}

function itemToTrack(item: Record<string, unknown>): AudioTrack | null {
  const flex = (item.flexColumns as Array<Record<string, unknown>> | undefined) ?? [];
  const titleRuns =
    (
      (
        (flex[0]?.musicResponsiveListItemFlexColumnRenderer as Record<string, unknown>)
          ?.text as Record<string, unknown>
      )?.runs as Array<{ text?: string; navigationEndpoint?: Record<string, unknown> }>
    ) ?? [];
  const name = walkRuns(titleRuns);
  const videoId =
    String(
      (
        titleRuns[0]?.navigationEndpoint as
          | { watchEndpoint?: { videoId?: string } }
          | undefined
      )?.watchEndpoint?.videoId ??
        (item.playlistItemData as { videoId?: string } | undefined)?.videoId ??
        '',
    ) || '';
  if (!videoId && !name) return null;

  const subtitleRuns =
    (
      (
        (flex[1]?.musicResponsiveListItemFlexColumnRenderer as Record<string, unknown>)
          ?.text as Record<string, unknown>
      )?.runs as Array<{ text?: string }>
    ) ?? [];
  const subtitle = walkRuns(subtitleRuns);
  const parts = subtitle.split('•').map((s) => s.trim());
  const artist = parts[0] ?? '';
  const durationLabel = parts.find((p) => /^\d+:\d+/.test(p));

  const thumbs =
    (
      (item.thumbnail as Record<string, unknown> | undefined)
        ?.musicThumbnailRenderer as Record<string, unknown> | undefined
    )?.thumbnail as { thumbnails?: Array<{ url?: string }> } | undefined;
  const coverUrl = thumbs?.thumbnails?.[thumbs.thumbnails.length - 1]?.url;

  const id = videoId || name;
  return {
    id: buildTrackId('ytm', id),
    name: name || videoId,
    artist,
    source: 'ytm',
    duration: parseDurationLabel(durationLabel),
    meta: {
      videoId,
      songId: videoId,
      coverUrl,
      albumName: parts.length > 2 ? parts[1] : undefined,
    },
  };
}

export async function ytmSearch(
  keyword: string,
  page = 1,
  limit = 30,
): Promise<{ tracks: AudioTrack[]; total: number }> {
  if (page > 1) {
    // continuation 简化：首屏足够，后续页暂空（避免复杂 token 状态）
    return { tracks: [], total: 0 };
  }
  try {
    const body = await innertubePost<{
      contents?: unknown;
    }>('search', {
      query: keyword,
      params: SONGS_PARAMS,
    });
    const items: unknown[] = [];
    collectMusicResponsiveListItems(body.contents, items);
    const tracks = items
      .map((it) => itemToTrack(it as Record<string, unknown>))
      .filter((t): t is AudioTrack => t !== null && Boolean(t.meta.videoId))
      .slice(0, limit);
    return {
      tracks,
      total: tracks.length >= limit ? limit + 1 : tracks.length,
    };
  } catch (err) {
    console.warn('[ytm] search failed', err);
    return { tracks: [], total: 0 };
  }
}

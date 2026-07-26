/**
 * YouTube Music 歌词（InnerTube next/browse → LRCLIB 由 lyric-resolver 兜底）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import { innertubePost } from '@/lib/media/audio/platform/api/ytm/innertube';

function collectText(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectText(n, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.text === 'string' && obj.text.trim()) {
    // timed lyrics lines often in runs
  }
  if (Array.isArray(obj.runs)) {
    const line = (obj.runs as Array<{ text?: string }>).map((r) => r.text ?? '').join('');
    if (line.trim()) out.push(line.trim());
  }
  for (const v of Object.values(obj)) {
    if (v === obj.runs) continue;
    collectText(v, out);
  }
}

function findLyricsBrowseId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findLyricsBrowseId(n);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const browse =
    (obj.browseEndpoint as { browseId?: string; browseEndpointContextSupportedConfigs?: unknown } | undefined)
      ?.browseId ??
    (obj.browseId as string | undefined);
  if (
    typeof browse === 'string' &&
    (browse.startsWith('MPLYt') || /lyrics/i.test(JSON.stringify(obj).slice(0, 200)))
  ) {
    // 常见 lyrics browseId
    if (browse.includes('lyrics') || browse.startsWith('MPLYt')) return browse;
  }
  // tabs 里 lyrics
  const title =
    (obj.title as string | undefined) ||
    walkTitle(obj);
  if (title && /lyric/i.test(title) && typeof browse === 'string') return browse;

  for (const v of Object.values(obj)) {
    const hit = findLyricsBrowseId(v);
    if (hit) return hit;
  }
  return null;
}

function walkTitle(obj: Record<string, unknown>): string {
  const runs = (obj.title as { runs?: Array<{ text?: string }> } | undefined)?.runs;
  return (runs ?? []).map((r) => r.text ?? '').join('');
}

export async function getYtmLyricBundle(track: AudioTrack): Promise<LyricBundle | null> {
  const videoId = String(track.meta.videoId ?? track.meta.songId ?? '');
  if (!videoId) return null;
  try {
    const next = await innertubePost<{ contents?: unknown }>('next', {
      videoId,
    });
    const browseId = findLyricsBrowseId(next.contents);
    if (!browseId) return null;
    const browsed = await innertubePost<{ contents?: unknown }>('browse', {
      browseId,
    });
    const lines: string[] = [];
    collectText(browsed.contents, lines);
    // 去重连续空行
    const lyric = [...new Set(lines)]
      .filter((l) => l.length > 0 && l.length < 200)
      .slice(0, 400)
      .join('\n');
    if (!lyric.trim()) return null;
    // 无时间轴纯文本：包一层伪 LRC 不便同步，直接作为 lyric 文本
    return { lyric };
  } catch (err) {
    console.warn('[ytm] lyrics failed', err);
    return null;
  }
}

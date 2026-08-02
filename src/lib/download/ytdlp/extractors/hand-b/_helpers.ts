/**
 * Shared helpers for hand-b — re-export hand-a helpers.
 */
export * from '../hand-a/_helpers';
export { parseIso8601, playlistFromMatches } from '../hand-a/helpers';

import type { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  mimetype2ext,
  str_or_none,
  unescapeHTML as unescapeHTMLUtil,
  clean_html,
} from '../../utils';

/** yt-dlp InfoExtractor._rta_search — RTA age-gate meta / boilerplate detection. */
export function rtaSearch(html: string): number | null {
  if (/<meta\s+name="rating"\s+content="RTA-5042-1996-1400-1577-RTA"/i.test(html)) return 18;
  const markers = [
    /Proudly Labeled <a href="http:\/\/www\.rtalabel\.org\/" title="Restricted to Adults">RTA<\/a>/i,
    />[^<]*you acknowledge you are at least (\d+) years old/i,
    />\s*(?:18\s+U(?:\.S\.C\.|SC)\s+)?(?:§+\s*)?2257\b/i,
  ];
  for (const marker of markers) {
    const m = html.match(marker);
    if (m) return m[1] ? Number(m[1]) : 18;
  }
  return null;
}

function protoRelative(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.startsWith('//') ? `https:${u}` : u;
}

/** yt-dlp InfoExtractor._parse_jwplayer_formats — pragmatic main-path subset. */
export async function parseJwplayerFormats(
  ie: InfoExtractor,
  sources: unknown[],
  videoId?: string,
  opts?: { m3u8Id?: string; mpdId?: string; baseUrl?: string },
): Promise<Format[]> {
  const formats: Format[] = [];
  const seen = new Set<string>();
  for (const raw of sources || []) {
    if (!raw || typeof raw !== 'object') continue;
    const source = raw as Record<string, unknown>;
    const fileUrl = protoRelative(str_or_none(source.file));
    if (!fileUrl || seen.has(fileUrl)) continue;
    seen.add(fileUrl);
    const sourceType = str_or_none(source.type) || '';
    const ext = determine_ext(fileUrl, mimetype2ext(sourceType) || undefined);
    if (sourceType === 'hls' || ext === 'm3u8' || fileUrl.includes('format=m3u8-aapl')) {
      formats.push(
        ...(await ie._extract_m3u8_formats(fileUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, opts?.m3u8Id, undefined, false)),
      );
    } else if (sourceType === 'dash' || ext === 'mpd' || fileUrl.includes('format=mpd-time-csf')) {
      formats.push(...(await ie._extract_mpd_formats(fileUrl, videoId, opts?.mpdId, undefined, false)));
    } else if (sourceType.startsWith('audio') || ['oga', 'aac', 'mp3', 'mpeg', 'vorbis'].includes(ext)) {
      formats.push({ format_id: ext || 'audio', url: fileUrl, ext, vcodec: 'none' });
    } else {
      const formatId = str_or_none(source.label) || undefined;
      formats.push({
        format_id: formatId || `jw-${formats.length}`,
        url: fileUrl,
        width: int_or_none(source.width) ?? undefined,
        height: int_or_none(source.height) ?? undefined,
        tbr: int_or_none(source.bitrate, 1000) ?? undefined,
        filesize: int_or_none(source.filesize) ?? undefined,
        ext: ext || undefined,
      });
    }
  }
  return formats;
}

/** yt-dlp InfoExtractor._parse_jwplayer_data — pragmatic main-path subset (single entry). */
export async function parseJwplayerData(
  ie: InfoExtractor,
  jwplayerData: unknown,
  videoId?: string,
  opts?: { requireTitle?: boolean; m3u8Id?: string; mpdId?: string; baseUrl?: string },
): Promise<VideoInfo> {
  const data = (jwplayerData && typeof jwplayerData === 'object' ? jwplayerData : {}) as Record<string, unknown>;
  let playlistItems = data.playlist as unknown;
  if (!Array.isArray(playlistItems)) playlistItems = [playlistItems || data];
  const videoData = ((playlistItems as unknown[]).find((v) => v && typeof v === 'object') || {}) as Record<
    string,
    unknown
  >;
  const sources = Array.isArray(videoData.sources) ? (videoData.sources as unknown[]) : [videoData];
  const thisVideoId = videoId || str_or_none(videoData.mediaid) || 'jwplayer';
  const formats = await parseJwplayerFormats(ie, sources, thisVideoId, opts);

  const subtitles: Record<string, Subtitle[]> = {};
  for (const track of (videoData.tracks as Record<string, unknown>[]) || []) {
    const kind = String(track?.kind || '').toLowerCase();
    if (kind !== 'captions' && kind !== 'subtitles') continue;
    const trackUrl = protoRelative(str_or_none(track.file));
    if (!trackUrl) continue;
    const label = str_or_none(track.label) || 'en';
    if (!subtitles[label]) subtitles[label] = [];
    subtitles[label]!.push({ url: trackUrl, ext: 'vtt' });
  }

  return {
    id: thisVideoId,
    title: unescapeHTMLUtil(str_or_none(videoData.title) || undefined) || (opts?.requireTitle === false ? undefined : thisVideoId),
    description: clean_html(str_or_none(videoData.description)),
    thumbnail: protoRelative(str_or_none(videoData.image)) || undefined,
    timestamp: int_or_none(videoData.pubdate) ?? undefined,
    duration: float_or_none(data.duration ?? videoData.duration) ?? undefined,
    subtitles,
    formats,
  };
}

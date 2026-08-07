/**
 * XSPF playlist parse — yt-dlp _parse_xspf / _extract_xspf_playlist.
 */

import type { Format, VideoInfo } from '../types';
import { float_or_none } from '../utils';
import { attr, findAll, findOne, parseXmlString, text, type XmlDoc } from './xml';

function joinUrl(base: string | undefined, rel: string | null | undefined): string | null {
  if (!rel) return null;
  try {
    return base ? new URL(rel, base).toString() : new URL(rel).toString();
  } catch {
    return rel;
  }
}

export function parseXspf(
  xspfDoc: XmlDoc | string,
  playlistId: string,
  opts?: { xspfUrl?: string; xspfBaseUrl?: string },
): VideoInfo[] {
  const doc = typeof xspfDoc === 'string' ? parseXmlString(xspfDoc) : xspfDoc;
  const base = opts?.xspfBaseUrl || opts?.xspfUrl;
  const entries: VideoInfo[] = [];

  const trackList = findOne(doc, 'trackList', true);
  const tracks = trackList ? findAll(trackList, 'track', false) : findAll(doc, 'track', true);

  for (const track of tracks) {
    const title = text(findOne(track, 'title', false)) || playlistId;
    const description = text(findOne(track, 'annotation', false)) || undefined;
    const thumbnail = text(findOne(track, 'image', false)) || undefined;
    const durationRaw = text(findOne(track, 'duration', false));
    const duration = float_or_none(durationRaw, 1000);

    const formats: Format[] = [];
    for (const location of findAll(track, 'location', false)) {
      const formatUrl = joinUrl(base, text(location));
      if (!formatUrl) continue;
      formats.push({
        url: formatUrl,
        manifest_url: opts?.xspfUrl,
        format_id: attr(location, 'label') || undefined,
        width: (() => {
          const w = attr(location, 'width');
          return w ? Number(w) : null;
        })(),
        height: (() => {
          const h = attr(location, 'height');
          return h ? Number(h) : null;
        })(),
      });
    }

    entries.push({
      id: playlistId,
      title,
      description,
      thumbnail,
      duration: duration ?? undefined,
      formats,
    });
  }

  return entries;
}

export function baseUrlFrom(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/[^/]+$/, '');
    return `${u.origin}${path}`;
  } catch {
    return url;
  }
}

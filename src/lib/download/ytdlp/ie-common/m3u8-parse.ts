/**
 * Parse-only m3u8 formats (no network) — yt-dlp _parse_m3u8_formats_and_subtitles subset.
 */

import type { Format, Subtitle } from '../types';
import { parseM3u8VodDuration, m3u8MetaFormat } from './helpers';

function absolutize(base: string, rel: string): string {
  try {
    return new URL(rel, base).toString();
  } catch {
    return rel;
  }
}

function joinNonempty(...parts: Array<string | null | undefined>): string {
  return parts.filter((p) => p != null && String(p).length > 0).join('-');
}

export function parseM3u8FormatsAndSubtitles(
  m3u8Doc: string,
  m3u8Url: string,
  ext = 'mp4',
  entryProtocol: 'm3u8' | 'm3u8_native' = 'm3u8_native',
  preference?: number | null,
  quality?: number | null,
  m3u8Id?: string,
): { formats: Format[]; subtitles: Record<string, Subtitle[]> } {
  const formats: Format[] = [];
  const subtitles: Record<string, Subtitle[]> = {};
  const lines = m3u8Doc.split(/\r?\n/);

  // Media playlist (no STREAM-INF master)
  const isMaster = lines.some((l) => l.startsWith('#EXT-X-STREAM-INF:'));
  if (!isMaster && /#EXTINF:/i.test(m3u8Doc)) {
    formats.push({
      format_id: m3u8Id || 'hls',
      url: m3u8Url,
      manifest_url: m3u8Url,
      ext,
      protocol: entryProtocol,
      preference: preference ?? undefined,
      quality: quality ?? undefined,
      vcodec: 'unknown',
      acodec: 'unknown',
    });
    return { formats, subtitles };
  }

  const hasSeparateAudio = lines.some(
    (l) => l.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/i.test(l),
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('#EXT-X-MEDIA:')) {
      const type = /TYPE=([A-Z-]+)/i.exec(line)?.[1]?.toUpperCase();
      const uri = /URI="([^"]+)"/i.exec(line)?.[1];
      const lang =
        /LANGUAGE="([^"]+)"/i.exec(line)?.[1] ||
        /NAME="([^"]+)"/i.exec(line)?.[1] ||
        'und';
      const groupId = /GROUP-ID="([^"]+)"/i.exec(line)?.[1];
      if (type === 'SUBTITLES' && uri) {
        const abs = absolutize(m3u8Url, uri);
        if (!subtitles[lang]) subtitles[lang] = [];
        subtitles[lang]!.push({ url: abs, ext: 'vtt', protocol: 'm3u8_native' });
      } else if (type === 'AUDIO' && uri) {
        formats.push({
          format_id: joinNonempty(m3u8Id, 'audio', groupId || lang, String(formats.length)),
          url: absolutize(m3u8Url, uri),
          manifest_url: m3u8Url,
          ext: 'm4a',
          protocol: entryProtocol,
          vcodec: 'none',
          acodec: 'unknown',
          language: lang,
          preference: preference ?? undefined,
          quality: quality ?? undefined,
        });
      }
      continue;
    }
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const next = lines[i + 1]?.trim();
      if (!next || next.startsWith('#')) continue;
      const abs = absolutize(m3u8Url, next);
      const res = /RESOLUTION=(\d+)x(\d+)/i.exec(line);
      const bw = /BANDWIDTH=(\d+)/i.exec(line)?.[1];
      const codecs = /CODECS="([^"]+)"/i.exec(line)?.[1] || '';
      const hasVideoCodec = /avc|hev|hvc|vp0?9|av01/i.test(codecs);
      const hasAudioCodec = /mp4a|opus|ac-?3|ec-?3/i.test(codecs);
      const referencesAudioGroup = /\bAUDIO="/i.test(line);
      const videoOnly =
        hasSeparateAudio && referencesAudioGroup && (hasVideoCodec || !hasAudioCodec);
      formats.push({
        format_id: `${m3u8Id || 'hls'}-${formats.length}`,
        url: abs,
        manifest_url: m3u8Url,
        ext,
        protocol: entryProtocol,
        width: res ? Number(res[1]) : null,
        height: res ? Number(res[2]) : null,
        tbr: bw ? Math.round(Number(bw) / 1000) : null,
        vcodec: videoOnly || hasVideoCodec ? 'unknown' : hasAudioCodec ? 'none' : 'unknown',
        acodec: videoOnly ? 'none' : 'unknown',
        preference: preference ?? undefined,
        quality: quality ?? undefined,
      });
    }
  }

  if (!formats.length) {
    formats.push(m3u8MetaFormat(m3u8Url, ext, preference, quality, m3u8Id || 'hls'));
  }
  return { formats, subtitles };
}

export { parseM3u8VodDuration };

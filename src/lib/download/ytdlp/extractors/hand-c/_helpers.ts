/**
 * Shared helpers for hand-c — re-export hand-a/hand-b helpers, plus a few
 * additions used by the c56 → cultureunplugged batch.
 */
export * from '../hand-b/_helpers';

import type { InfoExtractor } from '../../common';
import type { Format, Subtitle } from '../../types';
import { determine_ext, extract_attributes, mimetype2ext } from '../../utils';
import { urljoin } from '../hand-a/_helpers';

/** yt-dlp InfoExtractor._parse_html5_media_entries — pragmatic subset (one entry per <video>/<audio> tag). */
export async function parseHtml5MediaEntries(
  ie: InfoExtractor,
  baseUrl: string,
  html: string,
  videoId: string,
  opts?: { m3u8Id?: string },
): Promise<Array<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }>> {
  const results: Array<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> = [];
  for (const tagMatch of html.matchAll(/<(video|audio)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const tagAttrs = extract_attributes(tagMatch[2] || '');
    const inner = tagMatch[3] || '';
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    const srcs: Array<{ url: string; type?: string }> = [];
    if (tagAttrs.src) srcs.push({ url: tagAttrs.src, type: tagAttrs.type });
    for (const srcMatch of inner.matchAll(/<source\b([^>]*)>/gi)) {
      const attrs = extract_attributes(srcMatch[1] || '');
      if (attrs.src) srcs.push({ url: attrs.src, type: attrs.type });
    }

    for (const { url: rawUrl, type } of srcs) {
      const absUrl = urljoin(baseUrl, rawUrl);
      const ext = determine_ext(absUrl, '') || mimetype2ext(type) || '';
      if (ext === 'm3u8' || (type && type.includes('mpegurl'))) {
        formats.push(
          ...(await ie._extract_m3u8_formats(absUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, opts?.m3u8Id, undefined, false)),
        );
      } else if (ext === 'mpd') {
        formats.push(...(await ie._extract_mpd_formats(absUrl, videoId, undefined, undefined, false)));
      } else {
        formats.push({ format_id: ext || 'http', url: absUrl, ext: ext || undefined });
      }
    }

    for (const trackMatch of inner.matchAll(/<track\b([^>]*)>/gi)) {
      const attrs = extract_attributes(trackMatch[1] || '');
      const kind = (attrs.kind || '').toLowerCase();
      if (kind !== 'subtitles' && kind !== 'captions') continue;
      if (!attrs.src) continue;
      const lang = attrs.srclang || attrs.label || 'und';
      (subtitles[lang] ||= []).push({ url: urljoin(baseUrl, attrs.src), ext: determine_ext(attrs.src, 'vtt') });
    }

    results.push({ formats, subtitles });
  }
  return results;
}

/** Best-effort yt-dlp YoutubeIE._extract_url — find an embedded YouTube player URL in a webpage. */
export function extractYoutubeEmbedUrl(html: string): string | null {
  const patterns = [
    /<iframe[^>]+src=(["'])((?:https?:)?\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[^"'?#]+[^"']*)\1/i,
    /<param[^>]+name=(["'])movie\1[^>]+value=(["'])((?:https?:)?\/\/(?:www\.)?youtube\.com\/(?:v|embed)\/[^"']+)\2/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const grabbed = m?.[2] && m[2].startsWith('http') ? m[2] : m?.[3];
    if (grabbed) return grabbed.startsWith('//') ? `https:${grabbed}` : grabbed;
  }
  return null;
}

/** Simple hidden-input scraper — yt-dlp InfoExtractor._hidden_inputs pragmatic subset. */
export function hiddenInputs(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<input\b([^>]+)>/gi)) {
    const attrs = extract_attributes(m[1] || '');
    if ((attrs.type || '').toLowerCase() === 'hidden' || !attrs.type) {
      if (attrs.name) out[attrs.name] = attrs.value ?? '';
    }
  }
  return out;
}

/** Extract a single XML-ish tag's text content (best-effort, no namespaces). */
export function xmlTagText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m?.[1] != null ? m[1].trim() : null;
}

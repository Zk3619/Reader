/**
 * HTML5MediaEmbedIE / QuotedHTMLIE — ported from yt-dlp genericembeds.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unescapeHTML } from '../../utils';
import { genericId, genericTitle, parseHtml5MediaEntries } from './_helpers';

export class HTML5MediaEmbedIE extends InfoExtractor {
  static IE_NAME = 'html5';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('HTML5MediaEmbedIE is not a standalone extractor', { expected: true });
  }

  async _extractFromWebpage(url: string, webpage: string): Promise<VideoInfo[]> {
    const videoId = genericId(url);
    const title = genericTitle(this, url, webpage);
    const rawEntries = await parseHtml5MediaEntries(this, url, webpage, videoId, { m3u8Id: 'hls' });
    const entries: VideoInfo[] = [];
    rawEntries.forEach((entry, idx) => {
      const num = idx + 1;
      entries.push({
        id: rawEntries.length > 1 ? `${videoId}-${num}` : videoId,
        title: rawEntries.length > 1 ? `${title} (${num})` : title,
        formats: entry.formats,
        subtitles: entry.subtitles,
      });
    });
    return entries;
  }
}

export class QuotedHTMLIE extends InfoExtractor {
  static IE_NAME = 'generic:quoted-html';
  static IE_DESC = '';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('QuotedHTMLIE is not a standalone extractor', { expected: true });
  }

  async _extractFromWebpage(url: string, webpage: string): Promise<VideoInfo[]> {
    let combined = '';
    for (const m of webpage.matchAll(/\bdata-html=(["'])((?:(?!\1).)+)\1/g)) {
      const html = m[2]!;
      const unquoted = unescapeHTML(decodeURIComponent(html));
      if (unquoted !== html) combined += unquoted;
    }
    if (!combined) return [];
    const videoId = genericId(url);
    const title = genericTitle(this, url, combined);
    const rawEntries = await parseHtml5MediaEntries(this, url, combined, videoId, { m3u8Id: 'hls' });
    return rawEntries.map((entry, idx) => ({
      id: rawEntries.length > 1 ? `${videoId}-${idx + 1}` : videoId,
      title: rawEntries.length > 1 ? `${title} (${idx + 1})` : title,
      formats: entry.formats,
      subtitles: entry.subtitles,
    }));
  }
}

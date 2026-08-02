/**
 * JojIE — ported from yt-dlp joj.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, js_to_json } from '../../utils';
import { htmlExtractTitle } from './_helpers';

export class JojIE extends InfoExtractor {
  static IE_NAME = 'joj';
  static _VALID_URL = /(?:joj:|https?:\/\/media\.joj\.sk\/embed\/)(?<id>[^/?#^]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`https://media.joj.sk/embed/${videoId}`, videoId);

    const title =
      this._search_json<string>(
        /videoTitle\s*:/,
        webpage,
        'title',
        videoId,
        { contains: true, fatal: false, default: null },
      ) ||
      htmlExtractTitle(webpage) ||
      this._og_search_title(webpage) ||
      videoId;

    const bitratesRaw = this._search_regex(
      /(?:src|bitrates)\s*=\s*({.+?});/,
      webpage,
      'bitrates',
      null,
      false,
    ) || '{}';
    const bitrates =
      this._parse_json<{ mp4?: unknown[] }>(bitratesRaw, videoId, js_to_json, false) || {};

    const formats: Format[] = [];
    for (const formatUrl of bitrates.mp4 || []) {
      if (typeof formatUrl !== 'string') continue;
      let height = this._search_regex(/(\d+)[pP]|(pal)\./, formatUrl, 'height', null, false);
      if (height === 'pal') height = '576';
      formats.push({
        url: formatUrl,
        format_id: height ? `${height}p` : '0',
        ext: 'mp4',
        height: int_or_none(height) ?? undefined,
      });
    }

    if (!formats.length) {
      const playlistXml = await this._download_webpage(
        `https://media.joj.sk/services/Video.php?clip=${videoId}`,
        videoId,
      );
      for (const fileEl of playlistXml.matchAll(/<file\b([^>]*)\/?>/gi)) {
        const attrs = fileEl[1] || '';
        const path = /path=["']([^"']+)["']/.exec(attrs)?.[1];
        if (!path) continue;
        const formatId = /(?:\bid=["']([^"']+)["']|\blabel=["']([^"']+)["'])/.exec(attrs);
        const fid = formatId?.[1] || formatId?.[2] || '0';
        const storagePath = path.replace(/^dat\//, '');
        formats.push({
          url: `http://n16.joj.sk/storage/${storagePath}`,
          format_id: fid,
          ext: 'mp4',
          height:
            int_or_none(this._search_regex(/(\d+)[pP]/, fid || path, 'height', null, false)) ?? undefined,
        });
      }
    }

    const thumbUrl = this._og_search_thumbnail(webpage);
    return {
      id: videoId,
      title,
      thumbnail: thumbUrl ?? undefined,
      duration: int_or_none(this._search_regex(/videoDuration\s*:\s*(\d+)/, webpage, 'duration', null, false)) ?? undefined,
      formats,
    };
  }
}

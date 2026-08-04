// @ts-nocheck
/** YouJizzIE â€?ported from yt-dlp youjizz.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, parse_duration, url_or_none } from '../../utils';
import { htmlExtractTitle, parseHtml5MediaEntries, rtaSearch } from './_helpers';

export class YouJizzIE extends InfoExtractor {
  static IE_NAME = 'YouJizz';
  static _VALID_URL =
    /https?:\/\/(?:\w+\.)?youjizz\.com\/videos\/(?:[^/#?]*-(?<id>\d+)\.html|embed\/(?<embed_id>\d+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const videoId = mobj.groups!.id || mobj.groups!.embed_id!;

    const webpage = await this._download_webpage(url, videoId);
    const title = htmlExtractTitle(webpage) || videoId;

    const formats: Format[] = [];
    const encodingsRaw = this._search_regex(
      /[Ee]ncodings\s*=\s*(\[.+?\]);\n/,
      webpage,
      'encodings',
      '[]',
      false,
    );
    const encodings = (this._parse_json(encodingsRaw || '[]', videoId, null, false) as unknown[]) || [];

    for (const encoding of encodings) {
      if (!encoding || typeof encoding !== 'object') continue;
      const enc = encoding as Record<string, unknown>;
      const formatUrl = url_or_none(enc.filename);
      if (!formatUrl) continue;
      if (determine_ext(formatUrl) === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            formatUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          )),
        );
      } else {
        const formatId = (enc.name || enc.quality) != null ? String(enc.name || enc.quality) : undefined;
        const height = int_or_none(
          this._search_regex(/^(\d+)[pP]/, formatId || '', 'height', null, false),
        );
        formats.push({
          url: formatUrl,
          format_id: formatId,
          height: height ?? undefined,
        });
      }
    }

    let info: VideoInfo;
    if (formats.length) {
      info = { id: videoId, title, formats };
    } else {
      // YouJizz's HTML5 player has invalid HTML
      const fixed = webpage.replace(/"controls/g, '" controls');
      const entries = await parseHtml5MediaEntries(this, url, fixed, videoId);
      info = {
        id: videoId,
        title,
        formats: entries[0]?.formats || [],
        subtitles: entries[0]?.subtitles,
      };
    }

    const duration = parse_duration(
      this._search_regex(/<strong>Runtime:<\/strong>([^<]+)/, webpage, 'duration', null, false),
    );
    const uploader = this._search_regex(
      /<strong>Uploaded By:.*?<a[^>]*>([^<]+)/,
      webpage,
      'uploader',
      null,
      false,
    );

    return {
      ...info,
      id: videoId,
      title,
      age_limit: rtaSearch(webpage) ?? undefined,
      duration: duration ?? undefined,
      uploader: uploader || undefined,
    };
  }
}

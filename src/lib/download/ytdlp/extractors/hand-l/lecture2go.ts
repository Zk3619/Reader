/**
 * Lecture2GoIE — ported from yt-dlp lecture2go.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, parse_duration } from '../../utils';

export class Lecture2GoIE extends InfoExtractor {
  static IE_NAME = 'lecture2go';
  static _VALID_URL = /https?:\/\/lecture2go\.uni-hamburg\.de\/veranstaltungen\/-\/v\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const title = this._html_search_regex(/<em[^>]+class="title">(.+)<\/em>/, webpage, 'title')!;

    const formats: Format[] = [];
    const seen = new Set<string>();
    for (const m of webpage.matchAll(/var\s+playerUri\d+\s*=\s*"([^"]+)"/g)) {
      const mediaUrl = m[1]!;
      if (seen.has(mediaUrl)) continue;
      seen.add(mediaUrl);
      const ext = determine_ext(mediaUrl);
      if (ext === 'f4m') continue;
      if (ext === 'm3u8') {
        formats.push(...(await this._extract_m3u8_formats(mediaUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls')));
      } else if (!mediaUrl.startsWith('rtmp')) {
        formats.push({ format_id: ext || 'http', url: mediaUrl });
      }
    }

    return {
      id: videoId,
      title,
      formats,
      creator: this._html_search_regex(/<div[^>]+id="description">([^<]+)<\/div>/, webpage, 'creator', null, false) || undefined,
      duration: parse_duration(
        this._html_search_regex(/Duration:\s*<\/em>\s*<em[^>]*>([^<]+)<\/em>/, webpage, 'duration', null, false),
      ) ?? undefined,
      view_count: int_or_none(
        this._html_search_regex(/Views:\s*<\/em>\s*<em[^>]+>(\d+)<\/em>/, webpage, 'view count', null, false),
      ) ?? undefined,
    };
  }
}

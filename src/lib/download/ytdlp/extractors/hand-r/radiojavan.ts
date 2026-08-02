/** RadioJavanIE — ported from yt-dlp radiojavan.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { str_to_int, unified_strdate } from '../../utils';
import { parse_resolution, urljoin } from './_helpers';

export class RadioJavanIE extends InfoExtractor {
  static IE_NAME = 'RadioJavan';
  static _VALID_URL = /https?:\/\/(?:www\.)?radiojavan\.com\/videos\/video\/(?<id>[^/]+)\/?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const hostResp = await this._download_json<{ host?: string }>(
      'https://www.radiojavan.com/videos/video_host',
      videoId,
      undefined,
      {
        data: new URLSearchParams({ id: videoId }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: url,
        },
      },
    );
    const downloadHost = hostResp.host || 'https://host1.rjmusicmedia.com';
    const webpage = await this._download_webpage(url, videoId);

    const formats: Format[] = [];
    for (const m of webpage.matchAll(
      /RJ\.video(?<format_id>\d+[pPkK])\s*=\s*(["'])(?<url>(?:(?!\2).)+)\2/g,
    )) {
      const formatId = m.groups!.format_id!;
      const videoPath = m.groups!.url!;
      const f = parse_resolution(formatId);
      formats.push({
        ...f,
        url: urljoin(downloadHost, videoPath),
        format_id: formatId,
      });
    }

    return {
      id: videoId,
      title: this._og_search_title(webpage) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      upload_date:
        unified_strdate(
          this._search_regex(/class="date_added">Date added: ([^<]+)</, webpage, 'upload date', null, false) ||
            undefined,
        ) ?? undefined,
      view_count: str_to_int(
        this._search_regex(/class="views">Plays: ([\d,]+)/, webpage, 'view count', null, false) || undefined,
      ) ?? undefined,
      like_count: str_to_int(
        this._search_regex(/class="rating">([\d,]+) likes/, webpage, 'like count', null, false) || undefined,
      ) ?? undefined,
      dislike_count: str_to_int(
        this._search_regex(/class="rating">([\d,]+) dislikes/, webpage, 'dislike count', null, false) || undefined,
      ) ?? undefined,
      formats,
    };
  }
}

/**
 * ExpressenIE — ported from yt-dlp expressen.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, unescapeHTML, unified_timestamp } from '../../utils';

export class ExpressenIE extends InfoExtractor {
  static IE_NAME = 'expressen';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:expressen|di)\.se\/(?:(?:tvspelare\/video|video-?player\/embed)\/)?(?:tv|nyheter)\/(?:[^/?#]+\/)*(?<id>[^/?#&]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const extractData = (name: string): Record<string, unknown> => {
      const raw = this._search_regex(
        new RegExp(`data-${name}=(["'])(?<value>(?:(?!\\1).)+)\\1`),
        webpage,
        'info',
        undefined,
        true,
        'value',
      )!;
      return this._parse_json<Record<string, unknown>>(raw, displayId, unescapeHTML)!;
    };

    const info = extractData('video-tracking-info');
    const videoId = String(info.contentId ?? displayId);
    const data = extractData('article-data');
    const stream = String(data.stream ?? '');

    let formats: Format[];
    if (determine_ext(stream) === 'm3u8') {
      formats = await this._extract_m3u8_formats(stream, displayId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');
    } else {
      formats = [{ format_id: 'http', url: stream }];
    }

    return {
      id: videoId,
      display_id: displayId,
      title: (info.titleRaw as string) || (data.title as string) || displayId,
      description: (info.descriptionRaw as string) || undefined,
      thumbnail: (info.socialMediaImage as string) || (data.image as string) || undefined,
      duration:
        int_or_none(info.videoTotalSecondsDuration ?? data.totalSecondsDuration) ?? undefined,
      timestamp: unified_timestamp(info.publishDate) ?? undefined,
      formats,
    };
  }
}

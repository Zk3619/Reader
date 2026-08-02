/**
 * CrackedIE — ported from yt-dlp cracked.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_to_int } from '../../utils';
import { extractYoutubeEmbedUrl, parseIso8601 } from './_helpers';

export class CrackedIE extends InfoExtractor {
  static IE_NAME = 'cracked';
  static _VALID_URL = /https?:\/\/(?:www\.)?cracked\.com\/video_(?<id>\d+)_[\da-z-]+\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const youtubeUrl = extractYoutubeEmbedUrl(webpage);
    if (youtubeUrl) return this.url_result(youtubeUrl, 'Youtube');

    const videoUrl = this._html_search_regex(
      [/var\s+CK_vidSrc\s*=\s*"([^"]+)"/, /<video\s+src="([^"]+)"/],
      webpage,
      'video URL',
    )!;

    const title = this._search_regex(
      [/property="?og:title"?\s+content="([^"]+)"/, /class="?title"?>([^<]+)/],
      webpage,
      'title',
    )!;

    const description = this._search_regex(/name="?(?:og:)?description"?\s+content="([^"]+)"/, webpage, 'description', null, false);

    let timestamp: number | undefined;
    const timestampStr = this._html_search_regex(/"date"\s*:\s*"([^"]+)"/, webpage, 'upload date', null, false);
    if (timestampStr) {
      timestamp = parseIso8601(timestampStr.slice(0, -6)) ?? undefined;
    }

    const viewCount = str_to_int(this._html_search_regex(/<span\s+class="?views"? id="?viewCounts"?>([\d,.]+) Views<\/span>/, webpage, 'view count', null, false));
    const commentCount = str_to_int(this._html_search_regex(/<span\s+id="?commentCounts"?>([\d,.]+)<\/span>/, webpage, 'comment count', null, false));

    const dims = videoUrl.match(/_(?<width>\d+)X(?<height>\d+)\.mp4$/);
    const width = dims ? Number(dims.groups!.width) : undefined;
    const height = dims ? Number(dims.groups!.height) : undefined;

    return {
      id: videoId,
      url: videoUrl,
      title,
      description: description || undefined,
      timestamp,
      view_count: viewCount ?? undefined,
      comment_count: commentCount ?? undefined,
      height,
      width,
    };
  }
}

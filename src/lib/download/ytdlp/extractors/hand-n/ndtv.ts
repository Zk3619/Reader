/**
 * NDTVIE — ported from yt-dlp ndtv.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_duration, remove_end, unified_strdate } from '../../utils';
import { urljoin } from './_helpers';

export class NDTVIE extends InfoExtractor {
  static IE_NAME = 'ndtv';
  static _VALID_URL =
    /https?:\/\/(?:[^/]+\.)?ndtv\.com\/(?:[^/]+\/)*videos?\/?(?:[^/]+\/)*[^/?^&]+-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const title = decodeURIComponent(
      this._search_regex(/__title\s*=\s*'([^']+)'/, webpage, 'title', undefined, false) ||
        this._og_search_title(webpage) ||
        videoId,
    );

    const filename = this._search_regex(/(?:__)?filename\s*[:=]\s*'([^']+)'/, webpage, 'video filename')!;
    const videoUrl = urljoin('https://ndtvod.bc-ssl.cdn.bitgravity.com/23372/ndtv/', filename.replace(/^\//, ''));

    const duration = parse_duration(
      this._search_regex(/(?:__)?duration\s*[:=]\s*'([^']+)'/, webpage, 'duration', undefined, false) || undefined,
    );

    const uploadDate =
      unified_strdate(
        this._html_search_meta('publish-date', webpage, 'upload date', false) ||
          this._html_search_meta('uploadDate', webpage, 'upload date', false) ||
          this._search_regex(/datePublished"\s*:\s*"([^"]+)"/, webpage, 'upload date', undefined, false) ||
          undefined,
      ) ?? undefined;

    const description = remove_end(this._og_search_description(webpage) || '', ' (Read more)') || undefined;

    return {
      id: videoId,
      url: videoUrl,
      title,
      description,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      duration: duration ?? undefined,
      upload_date: uploadDate,
    };
  }
}

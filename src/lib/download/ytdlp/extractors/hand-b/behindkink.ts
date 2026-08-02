/**
 * BehindKinkIE — aligned with yt-dlp behindkink.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class BehindKinkIE extends InfoExtractor {
  static IE_NAME = 'behindkink';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?behindkink\.com\/(?<year>[0-9]{4})\/(?<month>[0-9]{2})\/(?<day>[0-9]{2})\/(?<id>[^/#?_]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups?.id ?? m[4] ?? '';

    const webpage = await this._download_webpage(url, displayId);

    const videoUrl = this._search_regex(/<source src="([^"]+)"/, webpage, 'video URL')!;
    const videoId = videoUrl.split('/').pop()!.split('_')[0]!;
    const uploadDate = `${m.groups?.year ?? m[1]}${m.groups?.month ?? m[2]}${m.groups?.day ?? m[3]}`;

    return {
      id: videoId,
      display_id: displayId,
      url: videoUrl,
      title: this._og_search_title(webpage) || displayId,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      description: this._og_search_description(webpage),
      upload_date: uploadDate,
      age_limit: 18,
      webpage_url: url,
      original_url: url,
      extractor: 'behindkink',
      extractor_key: 'BehindKink',
    };
  }
}

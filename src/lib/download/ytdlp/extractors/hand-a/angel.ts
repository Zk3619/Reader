/**
 * AngelIE — aligned with yt-dlp angel.py
 */

import { InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { merge_dicts, url_or_none } from '../../utils';

export class AngelIE extends InfoExtractor {
  static IE_NAME = 'angel';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?angel\.com\/watch\/(?<series>[^/?#]+)\/episode\/(?<id>[\w-]+)\/season-(?<season_number>\d+)\/episode-(?<episode_number>\d+)\/(?<title>[^/?#]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const jsonLd = { ...this._search_json_ld(webpage, videoId) };
    const streamUrl = String(jsonLd.url || jsonLd.contentUrl || '');
    delete jsonLd.url;
    delete jsonLd.contentUrl;
    delete jsonLd.embedUrl;
    delete jsonLd.thumbnails;

    const formats = await this._extract_m3u8_formats(
      streamUrl,
      videoId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hd',
      'Downloading HD m3u8 information',
      true,
    );

    const info: VideoInfo = {
      id: videoId,
      title: this._og_search_title(webpage) || videoId,
      description: this._og_search_description(webpage),
      formats,
      subtitles: {} as Record<string, Subtitle[]>,
      webpage_url: url,
      original_url: url,
      extractor: 'angel',
      extractor_key: 'Angel',
    };

    const baseThumbnailUrl =
      url_or_none(this._og_search_thumbnail(webpage)) ||
      url_or_none(jsonLd.thumbnail);
    if (baseThumbnailUrl) {
      info.thumbnail = baseThumbnailUrl.replace(
        /(\/upload)\/.+(\/angel-app\/.+)$/,
        '$1$2',
      );
    }

    return merge_dicts(info, jsonLd) as VideoInfo;
  }
}

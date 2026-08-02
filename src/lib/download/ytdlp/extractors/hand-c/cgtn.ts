/**
 * CGTNIE — ported from yt-dlp cgtn.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unified_timestamp } from '../../utils';

export class CGTNIE extends InfoExtractor {
  static IE_NAME = 'cgtn';
  static _VALID_URL =
    /https?:\/\/news\.cgtn\.com\/news\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/[a-zA-Z0-9-]+-(?<id>[a-zA-Z0-9-]+)\/index\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const downloadUrl = this._html_search_regex(/data-video ="(?<url>.+m3u8)"/, webpage, 'download_url')!;
    const datetimeStr = this._html_search_regex(/<span class="date">\s*(.+?)\s*<\/span>/, webpage, 'datetime_str', null, false);
    const category = this._html_search_regex(/<span class="section">\s*(.+?)\s*<\/span>/, webpage, 'category', null, false);
    const author = this._search_regex(/<div class="news-author-name">\s*(.+?)\s*<\/div>/, webpage, 'author', null, false);

    const ts = datetimeStr ? unified_timestamp(datetimeStr) : null;

    return {
      id: videoId,
      title: this._og_search_title(webpage) || undefined,
      description: this._og_search_description(webpage) || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      formats: await this._extract_m3u8_formats(downloadUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls'),
      categories: category ? [category] : undefined,
      creators: author ? [author] : undefined,
      timestamp: ts != null ? ts - 8 * 3600 : undefined,
    } as VideoInfo;
  }
}

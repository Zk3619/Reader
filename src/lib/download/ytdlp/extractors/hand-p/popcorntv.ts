/** PopcornTVIE — ported from yt-dlp popcorntv.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { extract_attributes, int_or_none, unified_timestamp } from '../../utils';

export class PopcornTVIE extends InfoExtractor {
  static IE_NAME = 'popcorntv';
  static _VALID_URL =
    /https?:\/\/[^/]+\.popcorntv\.it\/guarda\/(?<display_id>[^/]+)\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups?.display_id ?? '';
    const videoId = m.groups?.id ?? '';
    const webpage = await this._download_webpage(url, displayId);

    const linkTag = this._search_regex(
      /(<link[^>]+itemprop=["'](?:content|embed)Url[^>]*>)/,
      webpage,
      'content',
    )!;
    const m3u8Url = extract_attributes(linkTag).href;
    const formats: Format[] = await this._extract_m3u8_formats(
      m3u8Url,
      displayId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );

    const title =
      this._search_regex(/<h1[^>]+itemprop=["']name[^>]*>([^<]+)/, webpage, 'title', null, false) ||
      this._og_search_title(webpage) ||
      undefined;
    const description = this._html_search_regex(
      /<article[^>]+itemprop=["']description[^>]*>([\s\S]*?)<\/article>/,
      webpage,
      'description',
      null,
      false,
    );

    return {
      id: videoId,
      display_id: displayId,
      title,
      description: description ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      timestamp: unified_timestamp(this._html_search_meta('uploadDate', webpage, 'timestamp')) ?? undefined,
      duration: int_or_none(this._html_search_meta('duration', webpage), 60) ?? undefined,
      view_count: int_or_none(this._html_search_meta('interactionCount', webpage, 'view count')) ?? undefined,
      formats,
    };
  }
}

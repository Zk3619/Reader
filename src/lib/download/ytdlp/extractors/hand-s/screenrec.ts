/** ScreenRecIE — ported from yt-dlp screenrec.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { htmlExtractTitle } from './_helpers';

export class ScreenRecIE extends InfoExtractor {
  static IE_NAME = 'screenrec';
  static _VALID_URL = /https?:\/\/(?:www\.)?screenrec\.com\/share\/(?<id>\w{10})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const m3u8Url = this._search_regex(
      /customUrl\s*:\s*(["'])(?<url>(?:(?!\1).)+)\1/,
      webpage,
      'm3u8 URL',
      undefined,
      false,
      'url',
    )!;
    const formats = await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');
    return {
      id: videoId,
      title: this._og_search_title(webpage, false) || htmlExtractTitle(webpage) || videoId,
      description: this._og_search_description(webpage) || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      formats,
    };
  }
}

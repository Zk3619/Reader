/**
 * MyVidsterIE — ported from yt-dlp myvidster.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class MyVidsterIE extends InfoExtractor {
  static IE_NAME = 'myvidster';
  static _VALID_URL = /https?:\/\/(?:www\.)?myvidster\.com\/video\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const realUrl = this._html_search_regex(
      /rel="videolink" href="(?<real_url>.*)">/,
      webpage,
      'real video url',
    )!;
    return this.url_result(realUrl);
  }
}

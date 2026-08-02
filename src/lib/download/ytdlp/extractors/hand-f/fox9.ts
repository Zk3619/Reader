/**
 * FOX9IE / FOX9NewsIE â€?ported from yt-dlp fox9.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class FOX9IE extends InfoExtractor {
  static IE_NAME = 'fox9';
  static _VALID_URL = /https?:\/\/(?:www\.)?fox9\.com\/video\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this.url_result(
      `anvato:anvato_epfox_app_web_prod_b3373168e12f423f41504f207000188daf88251b:${videoId}`,
      'Anvato',
      videoId,
    );
  }
}

export class FOX9NewsIE extends InfoExtractor {
  static IE_NAME = 'fox9news';
  static _VALID_URL = /https?:\/\/(?:www\.)?fox9\.com\/news\/(?<id>[^/?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const anvatoId = this._search_regex(/anvatoId\s*:\s*['"](\d+)/, webpage, 'anvato id');
    return this.url_result(`https://www.fox9.com/video/${anvatoId}`, 'FOX9');
  }
}

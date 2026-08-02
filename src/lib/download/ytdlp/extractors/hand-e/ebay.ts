/**
 * EbayIE — ported from yt-dlp ebay.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { remove_end } from '../../utils';
import { htmlExtractTitle } from './_helpers';

export class EbayIE extends InfoExtractor {
  static IE_NAME = 'ebay';
  static _VALID_URL = /https?:\/\/(?:www\.)?ebay\.com\/itm\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const videoJson = this._search_json<Record<string, unknown>>(
      /"video":/,
      webpage,
      'video json',
      videoId,
    )!;

    const formats: Format[] = [];
    const playlistMap = (videoJson.playlistMap as Record<string, string>) || {};
    for (const [key, mediaUrl] of Object.entries(playlistMap)) {
      if (key === 'HLS') {
        formats.push(...(await this._extract_m3u8_formats(mediaUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, undefined, undefined, false)));
      } else if (key === 'DASH') {
        formats.push(...(await this._extract_mpd_formats(mediaUrl, videoId, undefined, undefined, false)));
      } else {
        this.report_warning(`Unsupported format ${key}`);
      }
    }

    return {
      id: videoId,
      title: remove_end(htmlExtractTitle(webpage), ' | eBay') || undefined,
      formats,
    };
  }
}

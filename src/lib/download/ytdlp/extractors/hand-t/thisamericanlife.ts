/**
 * ThisAmericanLifeIE — ported from yt-dlp thisamericanlife.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class ThisAmericanLifeIE extends InfoExtractor {
  static IE_NAME = 'thisamericanlife';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?thisamericanlife\.org\/(?:radio-archives\/episode\/|play_full\.php\?play=)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(
      `http://www.thisamericanlife.org/radio-archives/episode/${videoId}`,
      videoId,
    );

    return {
      id: videoId,
      url: `http://stream.thisamericanlife.org/${videoId}/stream/${videoId}_64k.m3u8`,
      protocol: 'm3u8_native',
      ext: 'm4a',
      acodec: 'aac',
      vcodec: 'none',
      abr: 64,
      title: this._html_search_meta('twitter:title', webpage, 'title', true) || videoId,
      description: this._html_search_meta('description', webpage, 'description') || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
    };
  }
}

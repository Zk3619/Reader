/**
 * HistoricFilmsIE — ported from yt-dlp historicfilms.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_duration } from '../../utils';

export class HistoricFilmsIE extends InfoExtractor {
  static IE_NAME = 'historicfilms';
  static _VALID_URL = /https?:\/\/(?:www\.)?historicfilms\.com\/(?:tapes\/|play)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const tapeId = this._search_regex(
      [/class="tapeId"[^>]*>([^<]+)</, /tapeId\s*:\s*"([^"]+)"/],
      webpage,
      'tape id',
    );

    const title = this._og_search_title(webpage) ?? videoId;
    const description = this._og_search_description(webpage) ?? undefined;
    const thumbnail =
      this._html_search_meta('thumbnailUrl', webpage, 'thumbnails', false) ||
      this._og_search_thumbnail(webpage) ||
      undefined;
    const duration = parse_duration(this._html_search_meta('duration', webpage, 'duration', false) || undefined);

    return {
      id: videoId,
      url: `http://www.historicfilms.com/video/${tapeId}_${videoId}_web.mov`,
      title,
      description,
      thumbnail,
      duration: duration ?? undefined,
    };
  }
}

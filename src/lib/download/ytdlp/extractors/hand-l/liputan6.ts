/**
 * Liputan6IE — ported from yt-dlp liputan6.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class Liputan6IE extends InfoExtractor {
  static IE_NAME = 'liputan6';
  static _VALID_URL = /https?:\/\/www\.liputan6\.com\/\w+\/read\/\d+\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const jsonData = this._search_json(/window\.kmklabs\.gtm\s*=/, webpage, 'json_data', displayId) as Record<
      string,
      unknown
    >;
    const videos = jsonData.videos as Record<string, { video_id?: string }> | undefined;
    const videoId = videos?.video_1?.video_id;
    if (!videoId) {
      throw new ExtractorError('Could not find video_id');
    }

    return this.url_result(
      `https://www.vidio.com/watch/${videoId}-${displayId}`,
      'Vidio',
      displayId,
    );
  }
}

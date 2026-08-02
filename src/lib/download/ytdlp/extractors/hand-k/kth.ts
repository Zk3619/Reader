/**
 * KTHIE — ported from yt-dlp kth.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { smuggle_url } from '../../utils';

export class KTHIE extends InfoExtractor {
  static IE_NAME = 'kth';
  static _VALID_URL = /https?:\/\/play\.kth\.se\/(?:[^/]+\/)+(?<id>[a-z0-9_]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this.url_result(
      smuggle_url(`kaltura:308:${videoId}`, { service_url: 'https://api.kaltura.nordu.net' }),
      'Kaltura',
      videoId,
    );
  }
}

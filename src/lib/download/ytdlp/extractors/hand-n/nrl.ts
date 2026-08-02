/** NRLTVIE — ported from yt-dlp nrl.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class NRLTVIE extends InfoExtractor {
  static IE_NAME = 'NRLTV';
  static _VALID_URL = /https?:\/\/(?:www\.)?nrl\.com\/tv(?:\/[^/]+)*\/(?<id>[^/?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const qData = this._parse_json<{ videoId?: string; title?: string }>(
      this._html_search_regex(/q-data="({[\s\S]+?})"/, webpage, 'player data'),
      displayId,
    )!;
    const ooyalaId = String(qData.videoId ?? '');
    return this.url_result(`ooyala:${ooyalaId}`, 'Ooyala', ooyalaId, qData.title);
  }
}

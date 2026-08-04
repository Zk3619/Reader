// @ts-nocheck
/** UnitedNationsWebTvIE â€?ported from yt-dlp unitednations.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class UnitedNationsWebTvIE extends InfoExtractor {
  static IE_NAME = 'unitednationswebtv';
  static _VALID_URL = /https?:\/\/webtv\.un\.org\/(?:ar|zh|en|fr|ru|es)\/asset\/\w+\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const partnerId = this._html_search_regex(/partnerId:\s*(\d+)/, webpage, 'partner_id')!;
    const entryId = this._html_search_regex(
      /const\s+kentryID\s*=\s*["'](\w+)["']/,
      webpage,
      'kentry_id',
    )!;

    return this.url_result(`kaltura:${partnerId}:${entryId}`, 'Kaltura');
  }
}

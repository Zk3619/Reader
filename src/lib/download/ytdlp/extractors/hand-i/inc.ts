/**
 * IncIE — ported from yt-dlp inc.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class IncIE extends InfoExtractor {
  static IE_NAME = 'inc';
  static _VALID_URL = /https?:\/\/(?:www\.)?inc\.com\/(?:[^/]+\/)+(?<id>[^.]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const partnerId =
      this._search_regex(/var\s+_?bizo_data_partner_id\s*=\s*["'](\d+)/, webpage, 'partner id', '1034971', false) ||
      '1034971';

    let kalturaId = this._search_regex(
      /id=(["'])kaltura_player_(?<id>.+?)\1/,
      webpage,
      'kaltura id',
      null,
      false,
      'id',
    );
    if (!kalturaId) {
      const jsonStr = this._search_regex(/pageInfo\.videos\s*=\s*\[(.+)\];/, webpage, 'kaltura id');
      kalturaId = (this._parse_json<{ vid_kaltura_id?: string }>(jsonStr!, displayId) || {}).vid_kaltura_id || null;
    }
    if (!kalturaId) throw new ExtractorError('Unable to extract Kaltura id', { expected: true });

    return this.url_result(`kaltura:${partnerId}:${kalturaId}`, 'Kaltura');
  }
}

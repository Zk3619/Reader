/**
 * TheStarIE — ported from yt-dlp thestar.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class TheStarIE extends InfoExtractor {
  static IE_NAME = 'thestar';
  static _VALID_URL = /https?:\/\/(?:www\.)?thestar\.com\/(?:[^/]+\/)*(?<id>.+)\.html/;
  static BRIGHTCOVE_URL_TEMPLATE =
    'http://players.brightcove.net/794267642001/default_default/index.html?videoId=%s';

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const brightcoveId = this._search_regex(
      /mainartBrightcoveVideoId["']?\s*:\s*["']?(\d+)/,
      webpage,
      'brightcove id',
    )!;
    return this.url_result(
      TheStarIE.BRIGHTCOVE_URL_TEMPLATE.replace('%s', brightcoveId),
      'BrightcoveNew',
      brightcoveId,
    );
  }
}

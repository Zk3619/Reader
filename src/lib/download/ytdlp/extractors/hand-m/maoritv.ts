/** MaoriTVIE — ported from yt-dlp maoritv.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class MaoriTVIE extends InfoExtractor {
  static IE_NAME = 'maoritv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?maoritelevision\.com\/shows\/(?:[^/]+\/)+(?<id>[^/?&#]+)/;
  static BRIGHTCOVE_URL_TEMPLATE =
    'http://players.brightcove.net/1614493167001/HJlhIQhQf_default/index.html?videoId=%s';

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const brightcoveId = this._search_regex(/data-main-video-id=["'](\d+)/, webpage, 'brightcove id')!;
    return this.url_result(
      MaoriTVIE.BRIGHTCOVE_URL_TEMPLATE.replace('%s', brightcoveId),
      'BrightcoveNew',
      brightcoveId,
    );
  }
}

/**
 * MLSSoccerIE — ported from yt-dlp mlssoccer.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

const VALID_DOMAINS =
  '(?:(?:cfmontreal|intermiamicf|lagalaxy|lafc|houstondynamofc|dcunited|atlutd|mlssoccer|fcdallas|columbuscrew|coloradorapids|fccincinnati|chicagofirefc|austinfc|nashvillesc|whitecapsfc|sportingkc|soundersfc|sjearthquakes|rsl|timbers|philadelphiaunion|orlandocitysc|newyorkredbulls|nycfc)\\.com|(?:torontofc)\\.ca|(?:revolutionsoccer)\\.net)';

export class MLSSoccerIE extends InfoExtractor {
  static IE_NAME = 'mlssoccer';
  static _VALID_URL = new RegExp(
    `https?:\\/\\/(?:www\\.)?${VALID_DOMAINS}\\/video\\/#?(?<id>[^/&$#?]+)`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const dataJson = this._parse_json<{ videoList: Array<{ accountId: string; videoId: string }> }>(
      this._html_search_regex(/data-options="([^"]+)"/, webpage, 'json'),
      videoId,
    )!.videoList[0]!;

    return {
      id: videoId,
      _type: 'url',
      url: `https://players.brightcove.net/${dataJson.accountId}/default_default/index.html?videoId=${dataJson.videoId}`,
      ie_key: 'BrightcoveNew',
      title: videoId,
    };
  }
}

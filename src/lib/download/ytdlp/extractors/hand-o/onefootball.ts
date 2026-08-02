/** OneFootballIE — ported from yt-dlp onefootball.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { make_archive_id } from './_helpers';

export class OneFootballIE extends InfoExtractor {
  static IE_NAME = 'onefootball';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?onefootball\.com\/[a-z]{2}\/video\/[^/&?#]+-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const dataJson = this._search_json_ld(webpage, videoId, { fatal: false }) || {};
    delete (dataJson as Record<string, unknown>).url;
    const m3u8Url = this._html_search_regex(
      /(https:\/\/cdn\.jwplayer\.com\/manifests\/\w+\.m3u8)/,
      webpage,
      'm3u8_url',
    )!;

    return {
      ...this.url_result(m3u8Url, 'JWPlatform', videoId),
      ...dataJson,
      _type: 'url_transparent',
      _old_archive_ids: [make_archive_id('onefootball', videoId)],
    };
  }
}

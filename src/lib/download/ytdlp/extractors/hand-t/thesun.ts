/**
 * TheSunIE — ported from yt-dlp thesun.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes } from '../../utils';

export class TheSunIE extends InfoExtractor {
  static IE_NAME = 'thesun';
  static _VALID_URL = /https?:\/\/(?:www\.)?the-?sun(?:\.co\.uk|\.com)\/[^/]+\/(?<id>\d+)/;
  static BRIGHTCOVE_URL_TEMPLATE =
    'http://players.brightcove.net/%s/default_default/index.html?videoId=%s';

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const webpage = await this._download_webpage(url, articleId);

    const entries: VideoInfo[] = [];
    for (const video of webpage.matchAll(/<video[^>]+data-video-id-pending=[^>]+>/gi)) {
      const attrs = extract_attributes(video[0]!);
      const videoId = attrs['data-video-id-pending'];
      if (!videoId) continue;
      const accountId = attrs['data-account'] || '5067014667001';
      entries.push(
        this.url_result(
          `http://players.brightcove.net/${accountId}/default_default/index.html?videoId=${videoId}`,
          'BrightcoveNew',
          videoId,
        ),
      );
    }

    return this.playlist_result(
      entries,
      articleId,
      this._og_search_title(webpage, false) || articleId,
    );
  }
}

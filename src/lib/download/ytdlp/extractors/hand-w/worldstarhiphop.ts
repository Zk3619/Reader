// @ts-nocheck
/** WorldStarHipHopIE â€?ported from yt-dlp worldstarhiphop.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parseHtml5MediaEntries } from './_helpers';

export class WorldStarHipHopIE extends InfoExtractor {
  static IE_NAME = 'worldstarhiphop';
  static _VALID_URL =
    /https?:\/\/(?:www|m)\.worldstar(?:candy|hiphop)\.com\/(?:videos|android)\/video\.php\?.*?\bv=(?<id>[^&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const entries = await parseHtml5MediaEntries(this, url, webpage, videoId);
    if (!entries.length) {
      return this.url_result(url, 'Generic');
    }

    const title =
      this._html_search_regex(
        [
          /<div class="content-heading">\s*<h1>([\s\S]*?)<\/h1>/,
          /<span[^>]+class="tc-sp-pinned-title">([\s\S]*)<\/span>/,
        ],
        webpage,
        'title',
      ) || videoId;

    return {
      ...entries[0]!,
      id: videoId,
      title,
    };
  }
}

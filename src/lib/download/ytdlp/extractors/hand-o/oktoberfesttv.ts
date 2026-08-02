/** OktoberfestTVIE — ported from yt-dlp oktoberfesttv.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class OktoberfestTVIE extends InfoExtractor {
  static IE_NAME = 'oktoberfesttv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?oktoberfest-tv\.de\/[^/]+\/[^/]+\/video\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const title = this._html_search_regex(/<h1><strong>[\s\S]*?<\/strong>([\s\S]*?)<\/h1>/, webpage, 'title')!;
    const clip = this._search_regex(/clip:\s*\{\s*url:\s*'([^']+)'/, webpage, 'clip')!;
    const ncurl = this._search_regex(/netConnectionUrl:\s*'([^']+)'/, webpage, 'rtmp base')!;
    const thumbnail = this._search_regex(
      /canvas:\s*\{\s*backgroundImage:\s*'url\(([^)]+)\)'/,
      webpage,
      'thumbnail',
      null,
      false,
    );

    return {
      id: videoId,
      title,
      url: ncurl + clip,
      ext: 'mp4',
      is_live: true,
      thumbnail: thumbnail || undefined,
    };
  }
}

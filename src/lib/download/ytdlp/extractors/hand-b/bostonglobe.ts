/**
 * BostonGlobeIE — aligned with yt-dlp bostonglobe.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes } from '../../utils';
import { playlistFromMatches } from './_helpers';

export class BostonGlobeIE extends InfoExtractor {
  static IE_NAME = 'bostonglobe';
  static _VALID_URL = /https?:\/\/(?:www\.)?bostonglobe\.com\/.*\/(?<id>[^/]+)\/\w+(?:\.html)?/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._match_id(url);
    const webpage = await this._download_webpage(url, pageId);

    const pageTitle = this._og_search_title(webpage) || undefined;

    const entries: string[] = [];
    for (const m of webpage.matchAll(/(<video[^>]+>)/gi)) {
      const attrs = extract_attributes(m[1]!);
      const videoId = attrs['data-brightcove-video-id'];
      const accountId = attrs['data-account'];
      const playerId = attrs['data-player'];
      const embed = attrs['data-embed'];
      if (videoId && accountId && playerId && embed) {
        entries.push(
          `http://players.brightcove.net/${accountId}/${playerId}_${embed}/index.html?videoId=${videoId}`,
        );
      }
    }

    if (entries.length === 0) {
      return this.url_result(url, 'Generic');
    } else if (entries.length === 1) {
      return this.url_result(entries[0]!, 'BrightcoveNew');
    }
    return playlistFromMatches(this, entries, pageId, { title: pageTitle, ie: 'BrightcoveNew' });
  }
}

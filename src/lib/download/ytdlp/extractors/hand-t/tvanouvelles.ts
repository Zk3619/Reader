/**
 * TVANouvellesIE / TVANouvellesArticleIE — ported from yt-dlp tvanouvelles.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

const BRIGHTCOVE_URL_TEMPLATE = 'http://players.brightcove.net/1741764581/default_default/index.html?videoId=%s';

export class TVANouvellesIE extends InfoExtractor {
  static IE_NAME = 'tvanouvelles';
  static _VALID_URL = /https?:\/\/(?:www\.)?tvanouvelles\.ca\/videos\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const brightcoveId = this._match_id(url);
    return this.url_result(
      BRIGHTCOVE_URL_TEMPLATE.replace('%s', brightcoveId),
      'BrightcoveNew',
      brightcoveId,
    );
  }
}

export class TVANouvellesArticleIE extends InfoExtractor {
  static IE_NAME = 'tvanouvelles:article';
  static _VALID_URL = /https?:\/\/(?:www\.)?tvanouvelles\.ca\/(?:[^/]+\/)+(?<id>[^/?#&]+)/;

  static suitable(url: string): boolean {
    return TVANouvellesIE.suitable(url) ? false : super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(/data-video-id=(["'])?(?<vid>\d+)/g)) {
      const vid = m.groups?.vid;
      if (!vid) continue;
      entries.push(
        this.url_result(`http://www.tvanouvelles.ca/videos/${vid}`, 'TVANouvelles', vid),
      );
    }

    return this.playlist_result(
      entries,
      displayId,
      this._og_search_title(webpage, false) || undefined,
      this._og_search_description(webpage) || undefined,
    );
  }
}

/**
 * CharlieRoseIE — ported from yt-dlp charlierose.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { remove_end } from '../../utils';
import { parseHtml5MediaEntries } from './_helpers';

export class CharlieRoseIE extends InfoExtractor {
  static IE_NAME = 'charlierose';
  static _VALID_URL = /https?:\/\/(?:www\.)?charlierose\.com\/(?:video|episode)(?:s|\/player)\/(?<id>\d+)/;

  private static _PLAYER_BASE = 'https://charlierose.com/video/player/%s';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const playerUrl = CharlieRoseIE._PLAYER_BASE.replace('%s', videoId);
    const webpage = await this._download_webpage(playerUrl, videoId);

    const title = remove_end(this._og_search_title(webpage), ' - Charlie Rose') || undefined;

    const entries = await parseHtml5MediaEntries(this, playerUrl, webpage, videoId, { m3u8Id: 'hls' });
    const entry = entries[0] || { formats: [], subtitles: {} };

    return {
      id: videoId,
      title,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      description: this._og_search_description(webpage) || undefined,
      formats: entry.formats,
      subtitles: entry.subtitles,
    };
  }
}

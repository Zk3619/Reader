/**
 * BFIPlayerIE — aligned with yt-dlp bfi.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes } from '../../utils';

export class BFIPlayerIE extends InfoExtractor {
  static IE_NAME = 'bfi:player';
  static _VALID_URL = /https?:\/\/player\.bfi\.org\.uk\/[^/]+\/film\/watch-(?<id>[\w-]+)-online/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(/<[^>]+class="player"[^>]*>/gis)) {
      const playerAttr = extract_attributes(m[0]);
      const ooyalaId = playerAttr['data-video-id'];
      if (!ooyalaId) continue;
      entries.push(this.url_result(`ooyala:${ooyalaId}`, 'Ooyala', ooyalaId, playerAttr['data-label']));
    }
    return this.playlist_result(entries, videoId);
  }
}

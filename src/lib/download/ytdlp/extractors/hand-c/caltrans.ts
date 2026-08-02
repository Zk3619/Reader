/**
 * CaltransIE — ported from yt-dlp caltrans.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class CaltransIE extends InfoExtractor {
  static IE_NAME = 'caltrans';
  static _VALID_URL = /https?:\/\/(?:[^/]+\.)?ca\.gov\/vm\/loc\/[^/]+\/(?<id>[a-z0-9_]+)\.htm/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const globalVars = this._search_regex(/<script[^<]+?([^<]+\.m3u8[^<]+)<\/script>/, webpage, 'Global Vars')!;
    const routePlace = this._search_regex(/routePlace\s*=\s*"([^"]+)"/, globalVars, 'Route Place', null, false);
    const locationName = this._search_regex(/locationName\s*=\s*"([^"]+)"/, globalVars, 'Location Name', null, false);
    const posterUrl = this._search_regex(/posterURL\s*=\s*"([^"]+)"/, globalVars, 'Poster Url', null, false);
    const videoStream = this._search_regex(/videoStreamURL\s*=\s*"([^"]+)"/, globalVars, 'Video Stream URL', null, false);

    const formats = await this._extract_m3u8_formats(videoStream!, videoId, 'ts');

    return {
      id: videoId,
      title: `${routePlace} : ${locationName}`,
      is_live: true,
      formats,
      thumbnail: posterUrl || undefined,
    };
  }
}

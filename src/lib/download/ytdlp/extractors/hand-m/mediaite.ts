/** MediaiteIE — ported from yt-dlp mediaite.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parseJwplayerData } from './_helpers';

export class MediaiteIE extends InfoExtractor {
  static IE_NAME = 'mediaite';
  static _VALID_URL = /https?:\/\/(?:www\.)?mediaite\.com(?!\/category)(?:\/[\w-]+){2}/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, undefined);
    const videoId =
      this._search_regex(/"https:\/\/cdn\.jwplayer\.com\/players\/(\w+)/, webpage, 'id', null, false) ||
      this._search_regex(/data-video-id\s*=\s*"([^"]+)"/, webpage, 'id')!;
    const dataJson = await this._download_json<unknown>(`https://cdn.jwplayer.com/v2/media/${videoId}`, videoId);
    return parseJwplayerData(this, dataJson, videoId);
  }
}

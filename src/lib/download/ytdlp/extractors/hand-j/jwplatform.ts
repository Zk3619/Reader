/**
 * JWPlatformIE — ported from yt-dlp jwplatform.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unsmuggle_url } from '../../utils';
import { parseJwplayerData } from './_helpers';

export class JWPlatformIE extends InfoExtractor {
  static IE_NAME = 'jwplatform';
  static _VALID_URL =
    /(?:https?:\/\/(?:content\.jwplatform|cdn\.jwplayer)\.com\/(?:(?:feed|player|thumb|preview|manifest)s|jw6|v2\/media)\/|jwplatform:)(?<id>[a-zA-Z0-9]{8})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const [realUrl] = unsmuggle_url(url, {});
    const videoId = this._match_id(realUrl);
    const jsonData = await this._download_json<unknown>(`https://cdn.jwplayer.com/v2/media/${videoId}`, videoId);
    return parseJwplayerData(this, jsonData, videoId);
  }
}

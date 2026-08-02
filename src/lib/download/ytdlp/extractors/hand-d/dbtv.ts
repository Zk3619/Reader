/**
 * DBTVIE — ported from yt-dlp dbtv.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class DBTVIE extends InfoExtractor {
  static IE_NAME = 'dbtv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?dagbladet\.no\/video\/(?:(?:embed|(?<display_id>[^/]+))\/)?(?<id>[0-9A-Za-z_-]{11}|[a-zA-Z0-9]{8})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups?.display_id;
    const videoId = m.groups!.id!;
    const info: VideoInfo = {
      _type: 'url_transparent',
      id: videoId,
      display_id: displayId ?? undefined,
    };
    if (videoId.length === 11) {
      return { ...info, url: videoId, ie_key: 'Youtube' };
    }
    return { ...info, url: `jwplatform:${videoId}`, ie_key: 'JWPlatform' };
  }
}

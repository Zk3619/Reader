/**
 * FunkIE â€?ported from yt-dlp funk.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class FunkIE extends InfoExtractor {
  static IE_NAME = 'funk';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|origin|play)\.)?funk\.net\/(?:channel|playlist)\/[^/?#]+\/(?<display_id>[0-9a-z-]+)-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.display_id!;
    const nexxId = m.groups!.id!;
    return {
      _type: 'url_transparent',
      url: `nexx:741:${nexxId}`,
      ie_key: 'Nexx',
      id: nexxId,
      display_id: displayId,
    };
  }
}

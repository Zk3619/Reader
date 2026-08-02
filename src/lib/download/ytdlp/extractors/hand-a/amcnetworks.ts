/**
 * AMCNetworksIE — aligned with yt-dlp amcnetworks.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, traverse_obj } from '../../utils';

export class AMCNetworksIE extends InfoExtractor {
  static IE_NAME = 'amcnetworks';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:amc|bbcamerica|ifc|(?:we|sundance)tv)\.com\/(?<id>(?:movies|shows(?:\/[^/?#]+)+)\/[^/?#&]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const initialData = this._search_json<Record<string, unknown>>(
      /window\.initialData\s*=\s*JSON\.parse\(String\.raw`/,
      webpage,
      'initial data',
      displayId,
    );
    if (!initialData) {
      throw new Error('Unable to extract AMC Networks initial data');
    }

    const videoId = str_or_none(
      traverse_obj(initialData, ['initialData', 'properties', 'videoId']),
    );
    if (!videoId) {
      this.raise_no_formats('This video is DRM protected', true);
    }

    const accountId = traverse_obj(initialData, ['config', 'brightcove', 'accountId']);
    const playerId = traverse_obj(initialData, ['config', 'brightcove', 'playerId']);
    const embedUrl = `https://players.brightcove.net/${accountId}/${playerId}_default/index.html?videoId=${videoId}`;

    return this.url_result(embedUrl, 'BrightcoveNew', videoId);
  }
}
